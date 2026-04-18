from __future__ import annotations

import logging
from io import BytesIO
from typing import Any, Sequence

from PIL import Image

from app.services.minio_service import MinioService

logger = logging.getLogger(__name__)


class ExamPaperDecomposer:
    """Crop question images from normalized 2D boxes and upload as PNG."""

    def __init__(self, storage: MinioService | None = None) -> None:
        self.storage = storage or MinioService()

    def extract_question_crops(
        self,
        original_image_bytes: bytes,
        question_payload: dict[str, Any],
        crop_prefix: str,
    ) -> list[str]:
        boxes = self._resolve_question_boxes(question_payload)
        if not boxes:
            question_id = question_payload.get("problem_number")
            logger.warning("Missing valid question_box_2d, skip crop: problem_number=%s", question_id)
            return []

        image = Image.open(BytesIO(original_image_bytes)).convert("RGB")
        width, height = image.size
        uploaded_urls: list[str] = []

        for idx, box in enumerate(boxes, start=1):
            pixel_box = self._normalized_box_to_pixels(box, width=width, height=height)
            if pixel_box is None:
                logger.warning("Invalid normalized box after clamping, skip: box=%s", box)
                continue

            left, upper, right, lower = pixel_box
            cropped = image.crop((left, upper, right, lower))

            cropped_buffer = BytesIO()
            cropped.save(cropped_buffer, format="PNG", optimize=True)
            cropped_bytes = cropped_buffer.getvalue()

            # Generate a lightweight preview thumbnail for list rendering.
            thumb = cropped.copy()
            thumb.thumbnail((500, 500), Image.Resampling.LANCZOS)
            thumb_buffer = BytesIO()
            thumb.save(thumb_buffer, format="WEBP", quality=60, method=6)
            thumb_bytes = thumb_buffer.getvalue()

            original_file_name = f"{crop_prefix}_{idx}.png"
            thumb_file_name = f"{crop_prefix}_{idx}_thumb.webp"

            uploaded = self.storage.upload_object(
                file_data=cropped_bytes,
                file_name=original_file_name,
                content_type="image/png",
            )
            self.storage.upload_object(
                file_data=thumb_bytes,
                file_name=thumb_file_name,
                content_type="image/webp",
            )
            uploaded_urls.append(uploaded)

        return uploaded_urls

    def batch_extract_paper(
        self,
        original_image_bytes: bytes,
        questions_payload: list[dict[str, Any]],
        paper_prefix: str,
    ) -> dict[str, list[str]]:
        """
        Batch crop all questions from one page in a single image decode.
        Returns dict mapping problem_number -> list of uploaded image URLs.
        """
        result: dict[str, list[str]] = {}
        
        image = Image.open(BytesIO(original_image_bytes)).convert("RGB")
        width, height = image.size
        
        for q_idx, payload in enumerate(questions_payload, start=1):
            problem_number = str(payload.get("problem_number", ""))
            boxes = self._resolve_question_boxes(payload)
            
            if not boxes:
                logger.warning(
                    "[CUT] batch crop: skip question with no valid box: problem_number=%s",
                    problem_number,
                )
                result[problem_number] = []
                continue
            
            uploaded_urls: list[str] = []
            
            for box_idx, box in enumerate(boxes, start=1):
                pixel_box = self._normalized_box_to_pixels(box, width=width, height=height)
                if pixel_box is None:
                    logger.warning(
                        "[CUT] batch crop: invalid box clamping: problem_number=%s box_idx=%s",
                        problem_number, box_idx,
                    )
                    continue
                
                left, upper, right, lower = pixel_box
                cropped = image.crop((left, upper, right, lower))
                
                # Save PNG original
                cropped_buffer = BytesIO()
                cropped.save(cropped_buffer, format="PNG", optimize=True)
                cropped_bytes = cropped_buffer.getvalue()
                
                # Generate WebP thumbnail
                thumb = cropped.copy()
                thumb.thumbnail((500, 500), Image.Resampling.LANCZOS)
                thumb_buffer = BytesIO()
                thumb.save(thumb_buffer, format="WEBP", quality=60, method=6)
                thumb_bytes = thumb_buffer.getvalue()
                
                original_file_name = f"{paper_prefix}_q{q_idx}_b{box_idx}.png"
                thumb_file_name = f"{paper_prefix}_q{q_idx}_b{box_idx}_thumb.webp"
                
                uploaded = self.storage.upload_object(
                    file_data=cropped_bytes,
                    file_name=original_file_name,
                    content_type="image/png",
                )
                self.storage.upload_object(
                    file_data=thumb_bytes,
                    file_name=thumb_file_name,
                    content_type="image/webp",
                )
                uploaded_urls.append(uploaded)
            
            result[problem_number] = uploaded_urls
        
        return result

    def crop_single_box(
        self,
        original_image_bytes: bytes,
        box_2d: Sequence[Any],
        crop_prefix: str,
    ) -> str:
        image = Image.open(BytesIO(original_image_bytes)).convert("RGB")
        width, height = image.size

        pixel_box = self._normalized_box_to_pixels(box_2d, width=width, height=height)
        if pixel_box is None:
            raise ValueError("Invalid normalized box coordinates")

        left, upper, right, lower = pixel_box
        cropped = image.crop((left, upper, right, lower))

        cropped_buffer = BytesIO()
        cropped.save(cropped_buffer, format="PNG", optimize=True)
        cropped_bytes = cropped_buffer.getvalue()

        return self.storage.upload_object(
            file_data=cropped_bytes,
            file_name=f"{crop_prefix}.png",
            content_type="image/png",
        )

    def _resolve_question_boxes(self, question_payload: dict[str, Any]) -> list[list[Any]]:
        primary_box = question_payload.get("question_box_2d")
        if isinstance(primary_box, list) and len(primary_box) == 4:
            return [primary_box]

        # Backward-compatible fallback for legacy responses.
        diagram_coordinates = question_payload.get("diagram_coordinates", [])
        if not isinstance(diagram_coordinates, list):
            return []

        boxes: list[list[Any]] = []
        for item in diagram_coordinates:
            box: Any = item
            if isinstance(item, dict):
                box = item.get("box_2d")
            if isinstance(box, list) and len(box) == 4:
                boxes.append(box)

        return boxes

    def _normalized_box_to_pixels(
        self,
        box: Sequence[Any],
        *,
        width: int,
        height: int,
    ) -> tuple[int, int, int, int] | None:
        try:
            ymin, xmin, ymax, xmax = [float(v) for v in box]
        except (TypeError, ValueError):
            return None

        # Normalized coordinates are in [0, 1000], convert to absolute pixels.
        upper = (ymin * height) / 1000.0
        left = (xmin * width) / 1000.0
        lower = (ymax * height) / 1000.0
        right = (xmax * width) / 1000.0

        left = max(0, min(width, int(round(left))))
        upper = max(0, min(height, int(round(upper))))
        right = max(0, min(width, int(round(right))))
        lower = max(0, min(height, int(round(lower))))

        if left >= right or upper >= lower:
            return None

        return left, upper, right, lower
