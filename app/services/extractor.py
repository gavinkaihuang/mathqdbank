import base64
import json
import logging
from copy import deepcopy
from io import BytesIO
from typing import Any

import requests
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import PromptTemplate, Question, QuestionImage, RawPaper
from app.services.minio_service import MinioService

logger = logging.getLogger(__name__)


class PaperExtractorService:
    def __init__(self) -> None:
        self.storage = MinioService()
        self.system_prompt = ""

    def process_paper(self, paper_id: int, db: Session) -> None:
        paper = db.get(RawPaper, paper_id)
        if paper is None:
            logger.error("RawPaper not found for extraction: %s", paper_id)
            return

        try:
            prompt_template = db.execute(
                select(PromptTemplate).where(PromptTemplate.name == "exam_paper_decomposer")
            ).scalar_one_or_none()
            if prompt_template is None:
                raise RuntimeError("Prompt template 'exam_paper_decomposer' not found")
            self.system_prompt = prompt_template.content

            all_questions: list[dict[str, Any]] = []

            for page_url in (paper.page_urls or []):
                image_bytes = self._download_image_bytes(page_url)
                base64_image = base64.b64encode(image_bytes).decode("utf-8")

                page_questions = self.call_llm_vision(base64_image)
                for question in page_questions:
                    coords = question.get("diagram_coordinates", [])
                    image_urls = self.crop_and_upload_images(image_bytes, coords)
                    question["_cropped_image_urls"] = image_urls

                all_questions.extend(page_questions)

            self._persist_questions(db, paper, all_questions)
            paper.status = "extracted"
            db.commit()
        except Exception:
            db.rollback()
            paper.status = "error"
            db.commit()
            logger.exception("Paper extraction failed for paper_id=%s", paper_id)

    def call_llm_vision(self, base64_image: str) -> list[dict[str, Any]]:
        api_key = getattr(settings, "GEMINI_API_KEY", "")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")
        if not self.system_prompt:
            raise RuntimeError("System prompt is empty")

        endpoint = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.MODEL_TIER_FLASH}:generateContent?key={api_key}"
        )
        endpoint_safe = endpoint.replace(api_key, "***")

        payload = {
            "system_instruction": {
                "parts": [{"text": self.system_prompt}],
            },
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json",
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": "请按系统提示词要求解析这张试卷图片，并只输出 JSON 数组。",
                        },
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": base64_image,
                            }
                        },
                    ],
                }
            ],
        }

        if settings.LLM_DEBUG_ENABLED:
            debug_payload = self._sanitize_payload_for_log(payload)
            logger.info("[LLM DEBUG] request endpoint=%s", endpoint_safe)
            logger.info("[LLM DEBUG] request payload=%s", json.dumps(debug_payload, ensure_ascii=False))

        response = requests.post(endpoint, json=payload, timeout=90)
        if settings.LLM_DEBUG_ENABLED:
            logger.info("[LLM DEBUG] response status=%s", response.status_code)
            logger.info(
                "[LLM DEBUG] response body=%s",
                self._truncate_text(response.text, settings.LLM_DEBUG_MAX_TEXT_CHARS),
            )
        response.raise_for_status()
        result = response.json()

        try:
            text = result["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError) as exc:
            raise RuntimeError(f"Unexpected Gemini response: {result}") from exc

        parsed = json.loads(text)
        if not isinstance(parsed, list):
            raise RuntimeError("LLM response JSON must be a list")

        return parsed

    def _sanitize_payload_for_log(self, payload: dict[str, Any]) -> dict[str, Any]:
        sanitized = deepcopy(payload)
        try:
            inline_data = sanitized["contents"][0]["parts"][1]["inline_data"]
            raw_data = str(inline_data.get("data", ""))
            inline_data["data"] = {
                "base64_length": len(raw_data),
                "base64_preview": self._truncate_text(raw_data, 120),
            }
        except (KeyError, IndexError, TypeError):
            return sanitized
        return sanitized

    def _truncate_text(self, text: str, max_chars: int) -> str:
        if len(text) <= max_chars:
            return text
        return f"{text[:max_chars]}...(truncated, total={len(text)} chars)"

    def crop_and_upload_images(
        self,
        original_image_bytes: bytes,
        coordinates: list[Any],
    ) -> list[str]:
        if not coordinates:
            return []

        uploaded_urls: list[str] = []
        image = Image.open(BytesIO(original_image_bytes)).convert("RGB")
        width, height = image.size

        for idx, item in enumerate(coordinates):
            box = item
            if isinstance(item, dict):
                box = item.get("box_2d")
            if not isinstance(box, list) or len(box) != 4:
                continue

            ymin, xmin, ymax, xmax = box
            left = int(max(0, min(width, (float(xmin) / 1000.0) * width)))
            upper = int(max(0, min(height, (float(ymin) / 1000.0) * height)))
            right = int(max(0, min(width, (float(xmax) / 1000.0) * width)))
            lower = int(max(0, min(height, (float(ymax) / 1000.0) * height)))

            if right <= left or lower <= upper:
                continue

            cropped = image.crop((left, upper, right, lower))
            cropped_buffer = BytesIO()
            cropped.save(cropped_buffer, format="JPEG", quality=95)
            cropped_bytes = cropped_buffer.getvalue()

            uploaded = self.storage.upload_object(
                file_data=cropped_bytes,
                file_name=f"question_crop_{idx + 1}.jpg",
                content_type="image/jpeg",
            )
            uploaded_urls.append(uploaded)

        return uploaded_urls

    def _download_image_bytes(self, object_name: str) -> bytes:
        return self.storage.get_object_bytes(object_name)

    def _persist_questions(
        self,
        db: Session,
        paper: RawPaper,
        question_payloads: list[dict[str, Any]],
    ) -> None:
        for payload in question_payloads:
            question = Question(
                raw_paper_id=paper.id,
                problem_number=str(payload.get("problem_number", "")),
                question_type=str(payload.get("question_type", "essay")),
                content_latex=str(payload.get("content_latex", "")),
                type_specific_data=payload.get("type_specific_data", {}),
                difficulty=float(payload.get("predicted_difficulty", 0.5)),
                status="pending_review",
            )
            db.add(question)
            db.flush()

            cropped_urls = payload.get("_cropped_image_urls", [])
            if isinstance(cropped_urls, list) and cropped_urls:
                question.image_url = cropped_urls[0]
                for i, image_url in enumerate(cropped_urls, start=1):
                    db.add(
                        QuestionImage(
                            question_id=question.id,
                            image_url=str(image_url),
                            desc=f"diagram_{i}",
                        )
                    )


# Example usage with KeyRelayClient before calling Gemini:
#
# async def call_gemini_with_retry(base64_image: str, system_prompt: str) -> dict[str, Any]:
#     relay_client = KeyRelayClient()
#     last_error: Exception | None = None
#
#     for _ in range(3):
#         key_payload = await relay_client.get_key(platform="Gemini")
#         api_key = key_payload.get("key") or key_payload.get("apiKey")
#         key_id = key_payload["keyId"]
#         endpoint = (
#             "https://generativelanguage.googleapis.com/v1beta/models/"
#             f"{settings.MODEL_TIER_FLASH}:generateContent?key={api_key}"
#         )
#
#         try:
#             async with httpx.AsyncClient(timeout=90) as client:
#                 response = await client.post(endpoint, json={...})
#                 response.raise_for_status()
#                 return response.json()
#         except httpx.HTTPStatusError as exc:
#             if exc.response.status_code == 429:
#                 await relay_client.report_error(key_id=key_id, raw_error=exc.response.text)
#                 last_error = exc
#                 continue
#             raise
#
#     if last_error is not None:
#         raise last_error
