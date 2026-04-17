import base64
import json
import logging
import uuid
from copy import deepcopy
from typing import Any

import requests
from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import PromptTemplate, Question, QuestionImage, RawPaper
from app.services.exam_paper_decomposer import ExamPaperDecomposer
from app.services import extraction_runtime
from app.services.key_manager import KeyRelayClient
from app.services.minio_service import MinioService

logger = logging.getLogger(__name__)


class PaperExtractorService:
    def __init__(self) -> None:
        self.storage = MinioService()
        self.decomposer = ExamPaperDecomposer(self.storage)
        self.key_relay = KeyRelayClient()
        self._question_images_table_available: bool | None = None
        self.system_prompt = ""

    def process_paper(self, paper_id: int, db: Session) -> None:
        run_id = uuid.uuid4().hex[:8]
        paper = db.get(RawPaper, paper_id)
        if paper is None:
            logger.error("[CUT] paper not found: run_id=%s paper_id=%s", run_id, paper_id)
            return

        try:
            total_pages = len(paper.page_urls or [])
            logger.info(
                "[CUT] extraction started: run_id=%s paper_id=%s pages=%s",
                run_id,
                paper.id,
                total_pages,
            )
            extraction_runtime.start(
                paper.id,
                run_id,
                step="start",
                message="任务已开始，正在初始化",
            )
            extraction_runtime.update(paper.id, pages_total=total_pages)
            paper.status = "processing"
            db.commit()

            prompt_template = db.execute(
                select(PromptTemplate).where(PromptTemplate.name == "exam_paper_decomposer")
            ).scalar_one_or_none()
            if prompt_template is None:
                raise RuntimeError("Prompt template 'exam_paper_decomposer' not found")
            self.system_prompt = prompt_template.content
            logger.info(
                "[CUT] prompt loaded: run_id=%s paper_id=%s prompt=%s version=%s",
                run_id,
                paper.id,
                prompt_template.name,
                prompt_template.version,
            )
            extraction_runtime.update(
                paper.id,
                step="prompt_loaded",
                progress=5,
                message=f"已加载提示词模板 {prompt_template.name}",
            )

            all_questions: list[dict[str, Any]] = []

            for page_index, page_url in enumerate((paper.page_urls or []), start=1):
                if self._abort_if_stop_requested(db, paper, run_id):
                    return
                progress = 10 + int((page_index - 1) * 70 / max(total_pages, 1))
                logger.info(
                    "[CUT] page started: run_id=%s paper_id=%s page=%s/%s progress=%s%% url=%s",
                    run_id,
                    paper.id,
                    page_index,
                    total_pages,
                    progress,
                    page_url,
                )
                extraction_runtime.update(
                    paper.id,
                    step="page_started",
                    progress=progress,
                    message=f"正在处理第 {page_index}/{total_pages} 页",
                )
                try:
                    image_bytes = self._download_image_bytes(page_url)
                    logger.info(
                        "[CUT] page image downloaded: run_id=%s paper_id=%s page=%s bytes=%s",
                        run_id,
                        paper.id,
                        page_index,
                        len(image_bytes),
                    )
                except Exception:
                    logger.exception(
                        "[CUT] failed to download page image: run_id=%s paper_id=%s page=%s url=%s",
                        run_id,
                        paper.id,
                        page_index,
                        page_url,
                    )
                    continue

                try:
                    base64_image = base64.b64encode(image_bytes).decode("utf-8")
                    page_questions = self.call_llm_vision(
                        base64_image,
                        paper_id=paper.id,
                        page_index=page_index,
                        total_pages=total_pages,
                        run_id=run_id,
                    )
                    logger.info(
                        "[CUT] page parsed by LLM: run_id=%s paper_id=%s page=%s question_count=%s",
                        run_id,
                        paper.id,
                        page_index,
                        len(page_questions),
                    )
                    extraction_runtime.update(
                        paper.id,
                        step="llm_parsed",
                        progress=min(progress + 10, 85),
                        message=f"第 {page_index}/{total_pages} 页解析完成，识别到 {len(page_questions)} 题",
                        questions_detected_delta=len(page_questions),
                    )
                except Exception:
                    logger.exception(
                        "[CUT] failed to parse page by LLM: run_id=%s paper_id=%s page=%s",
                        run_id,
                        paper.id,
                        page_index,
                    )
                    extraction_runtime.update(
                        paper.id,
                        step="llm_failed",
                        message=f"第 {page_index}/{total_pages} 页 LLM 解析失败",
                        llm_page_failures_delta=1,
                    )
                    continue

                for question_index, question in enumerate(page_questions, start=1):
                    if self._abort_if_stop_requested(db, paper, run_id):
                        return
                    if not isinstance(question, dict):
                        logger.warning(
                            "[CUT] skip non-dict question payload: run_id=%s paper_id=%s page=%s question=%s",
                            run_id,
                            paper.id,
                            page_index,
                            question_index,
                        )
                        continue

                    try:
                        image_urls = self.decomposer.extract_question_crops(
                            original_image_bytes=image_bytes,
                            question_payload=question,
                            crop_prefix=f"paper_{paper.id}_p{page_index}_q{question_index}",
                        )
                        question["_cropped_image_urls"] = image_urls
                        content_preview = self._truncate_text(
                            str(question.get("content_latex", ""))
                            .replace("\n", " ")
                            .strip(),
                            120,
                        )
                        preview_urls = ",".join(str(u) for u in image_urls[:2])
                        logger.info(
                            "[CUT] question cut completed: run_id=%s paper_id=%s page=%s/%s q_idx=%s problem_number=%s question_type=%s crops=%s preview_urls=%s content_preview=%s",
                            run_id,
                            paper.id,
                            page_index,
                            total_pages,
                            question_index,
                            str(question.get("problem_number", "")),
                            str(question.get("question_type", "")),
                            len(image_urls),
                            preview_urls,
                            content_preview,
                        )
                        extraction_runtime.update(
                            paper.id,
                            images_cropped_delta=len(image_urls),
                        )
                    except Exception:
                        logger.exception(
                            "[CUT] failed to crop question images: run_id=%s paper_id=%s page=%s question=%s",
                            run_id,
                            paper.id,
                            page_index,
                            question_index,
                        )
                        question["_cropped_image_urls"] = []

                    if not question.get("_cropped_image_urls"):
                        content_preview = self._truncate_text(
                            str(question.get("content_latex", ""))
                            .replace("\n", " ")
                            .strip(),
                            120,
                        )
                        logger.info(
                            "[CUT] question processed without crops: run_id=%s paper_id=%s page=%s/%s q_idx=%s problem_number=%s question_type=%s content_preview=%s",
                            run_id,
                            paper.id,
                            page_index,
                            total_pages,
                            question_index,
                            str(question.get("problem_number", "")),
                            str(question.get("question_type", "")),
                            content_preview,
                        )

                    all_questions.append(question)

                progress = 10 + int(page_index * 70 / max(total_pages, 1))
                logger.info(
                    "[CUT] page finished: run_id=%s paper_id=%s page=%s/%s cumulative_questions=%s progress=%s%%",
                    run_id,
                    paper.id,
                    page_index,
                    total_pages,
                    len(all_questions),
                    progress,
                )
                extraction_runtime.update(
                    paper.id,
                    step="page_finished",
                    progress=progress,
                    message=f"第 {page_index}/{total_pages} 页处理结束，累计 {len(all_questions)} 题",
                    pages_processed_delta=1,
                )

            if not all_questions:
                logger.error("[CUT] no questions extracted: run_id=%s paper_id=%s", run_id, paper.id)
                paper.status = "error"
                db.commit()
                extraction_runtime.update(
                    paper.id,
                    status="failed",
                    step="no_questions",
                    progress=100,
                    message="未提取到任何题目（可查看 llm_failed 计数）",
                )
                return

            if self._abort_if_stop_requested(db, paper, run_id):
                return

            logger.info(
                "[CUT] persisting questions: run_id=%s paper_id=%s total_payloads=%s progress=90%%",
                run_id,
                paper.id,
                len(all_questions),
            )
            extraction_runtime.update(
                paper.id,
                step="persisting",
                progress=90,
                message=f"正在入库 {len(all_questions)} 道题目",
            )
            persisted_count = self._persist_questions(db, paper, all_questions, run_id=run_id)
            paper.status = "extracted"
            db.commit()
            logger.info(
                "[CUT] extraction completed: run_id=%s paper_id=%s persisted=%s status=%s progress=100%%",
                run_id,
                paper.id,
                persisted_count,
                paper.status,
            )
            extraction_runtime.update(
                paper.id,
                status="completed",
                step="done",
                progress=100,
                message=f"切题完成，成功入库 {persisted_count} 道题目",
            )
        except Exception:
            db.rollback()
            paper.status = "error"
            db.commit()
            logger.exception("[CUT] extraction failed: run_id=%s paper_id=%s", run_id, paper_id)
            extraction_runtime.update(
                paper_id,
                status="failed",
                step="exception",
                progress=100,
                message="切题流程异常中断",
            )

    def _abort_if_stop_requested(self, db: Session, paper: RawPaper, run_id: str) -> bool:
        if not extraction_runtime.is_stop_requested(paper.id):
            return False

        paper.status = "failed"
        db.commit()
        extraction_runtime.update(
            paper.id,
            status="failed",
            step="stopped",
            message="任务已手动停止",
        )
        logger.warning("[CUT] extraction stopped by user: run_id=%s paper_id=%s", run_id, paper.id)
        return True

    def call_llm_vision(
        self,
        base64_image: str,
        *,
        paper_id: int,
        page_index: int,
        total_pages: int,
        run_id: str,
    ) -> list[dict[str, Any]]:
        api_key, key_id, key_source, cooldown_info = self._resolve_gemini_key(
            run_id=run_id,
            paper_id=paper_id,
            page_index=page_index,
            total_pages=total_pages,
        )
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

        logger.info(
            "[CUT] invoking LLM vision: run_id=%s paper_id=%s page=%s/%s model=%s key_source=%s key_id=%s key_cooldown=%s image_base64_len=%s",
            run_id,
            paper_id,
            page_index,
            total_pages,
            settings.MODEL_TIER_FLASH,
            key_source,
            key_id or "-",
            cooldown_info,
            len(base64_image),
        )

        if settings.LLM_DEBUG_ENABLED:
            debug_payload = self._sanitize_payload_for_log(payload)
            logger.info("[LLM DEBUG] request endpoint=%s", endpoint_safe)
            logger.info("[LLM DEBUG] request payload=%s", json.dumps(debug_payload, ensure_ascii=False))

        try:
            response = requests.post(endpoint, json=payload, timeout=90)
        except requests.RequestException as exc:
            # Network errors are not returned by LLM provider payload, so skip callback.
            raise RuntimeError(f"Gemini request failed: {exc}") from exc

        logger.info(
            "[CUT] LLM response received: run_id=%s paper_id=%s page=%s/%s status=%s",
            run_id,
            paper_id,
            page_index,
            total_pages,
            response.status_code,
        )
        logger.info(
            "[CUT] LLM key usage finished: run_id=%s paper_id=%s page=%s/%s key_source=%s key_id=%s key_cooldown=%s",
            run_id,
            paper_id,
            page_index,
            total_pages,
            key_source,
            key_id or "-",
            cooldown_info,
        )
        if response.status_code >= 400:
            self._report_key_error(
                key_id=key_id,
                raw_error=self._truncate_text(
                    f"HTTP_{response.status_code}: {response.text}",
                    settings.LLM_DEBUG_MAX_TEXT_CHARS,
                ),
                run_id=run_id,
                paper_id=paper_id,
                page_index=page_index,
                total_pages=total_pages,
            )
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

        parsed = self._parse_llm_json(text)
        if not isinstance(parsed, list):
            raise RuntimeError("LLM response JSON must be a list")

        logger.info(
            "[CUT] LLM response parsed: run_id=%s paper_id=%s page=%s/%s parsed_items=%s",
            run_id,
            paper_id,
            page_index,
            total_pages,
            len(parsed),
        )

        return parsed

    def _resolve_gemini_key(
        self,
        *,
        run_id: str,
        paper_id: int,
        page_index: int,
        total_pages: int,
    ) -> tuple[str, str | None, str, str]:
        env_key_configured = bool(getattr(settings, "GEMINI_API_KEY", "").strip())
        logger.info(
            "[CUT] preparing LLM key: run_id=%s paper_id=%s page=%s/%s source=key_relay env_configured=%s",
            run_id,
            paper_id,
            page_index,
            total_pages,
            env_key_configured,
        )
        logger.info(
            "[CUT] requesting key from relay: run_id=%s paper_id=%s page=%s/%s",
            run_id,
            paper_id,
            page_index,
            total_pages,
        )
        try:
            key_payload = self.key_relay.get_key_sync(platform="Gemini")
        except Exception as exc:
            raise RuntimeError(f"Failed to get Gemini key from relay: {exc}") from exc

        key_id = str(key_payload.get("keyId") or key_payload.get("id") or "")
        relay_key = str(key_payload.get("key") or key_payload.get("apiKey") or "").strip()
        if not relay_key:
            raise RuntimeError("Key relay returned empty Gemini key")
        cooldown_info = self.key_relay.describe_cooldown(key_payload)

        logger.info(
            "[CUT] relay key ready: run_id=%s paper_id=%s page=%s/%s key_id=%s key_length=%s cooldown=%s",
            run_id,
            paper_id,
            page_index,
            total_pages,
            key_id,
            len(relay_key),
            cooldown_info,
        )
        return relay_key, key_id or None, "key_relay", cooldown_info

    def _report_key_error(
        self,
        *,
        key_id: str | None,
        raw_error: str,
        run_id: str,
        paper_id: int,
        page_index: int,
        total_pages: int,
    ) -> None:
        if not key_id:
            return
        try:
            logger.info(
                "[CUT] reporting key error to relay: run_id=%s paper_id=%s page=%s/%s key_id=%s",
                run_id,
                paper_id,
                page_index,
                total_pages,
                key_id,
            )
            self.key_relay.report_error_sync(key_id=key_id, raw_error=raw_error)
        except Exception:
            logger.exception(
                "[CUT] failed to report key error to relay: run_id=%s paper_id=%s page=%s/%s key_id=%s",
                run_id,
                paper_id,
                page_index,
                total_pages,
                key_id,
            )

    def _parse_llm_json(self, text: str) -> list[dict[str, Any]]:
        text = text.strip()
        if text.startswith("```"):
            lines = text.splitlines()
            if len(lines) >= 3:
                text = "\n".join(lines[1:-1]).strip()

        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"LLM response is not valid JSON: {exc}") from exc

        if not isinstance(parsed, list):
            raise RuntimeError("LLM response JSON must be a list")

        normalized: list[dict[str, Any]] = []
        for item in parsed:
            if isinstance(item, dict):
                normalized.append(item)
            else:
                logger.warning("Skip non-object JSON item from LLM: item=%s", item)
        return normalized

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

    def _download_image_bytes(self, object_name: str) -> bytes:
        return self.storage.get_object_bytes(object_name)

    def _persist_questions(
        self,
        db: Session,
        paper: RawPaper,
        question_payloads: list[dict[str, Any]],
        *,
        run_id: str,
    ) -> int:
        persisted_count = 0
        can_persist_question_images = self._can_persist_question_images(db)
        for index, payload in enumerate(question_payloads, start=1):
            try:
                with db.begin_nested():
                    question = Question(
                        raw_paper_id=paper.id,
                        problem_number=str(payload.get("problem_number", "")),
                        question_type=str(payload.get("question_type", "essay")),
                        content_latex=str(payload.get("content_latex", "")),
                        type_specific_data=payload.get("type_specific_data", {}),
                        difficulty=self._safe_float(payload.get("predicted_difficulty", 0.5), 0.5),
                        status="pending_review",
                    )
                    db.add(question)
                    db.flush()

                    cropped_urls = payload.get("_cropped_image_urls", [])
                    if isinstance(cropped_urls, list) and cropped_urls:
                        question.image_url = str(cropped_urls[0])
                        if can_persist_question_images:
                            for i, image_url in enumerate(cropped_urls, start=1):
                                db.add(
                                    QuestionImage(
                                        question_id=question.id,
                                        image_url=str(image_url),
                                        desc=f"diagram_{i}",
                                    )
                                )
                        else:
                            logger.warning(
                                "[CUT] skip question_images persistence because table is unavailable: run_id=%s paper_id=%s idx=%s image_count=%s",
                                run_id,
                                paper.id,
                                index,
                                len(cropped_urls),
                            )
                persisted_count += 1
                logger.info(
                    "[CUT] question persisted: run_id=%s paper_id=%s idx=%s question_id=%s",
                    run_id,
                    paper.id,
                    index,
                    question.id,
                )
            except Exception:
                logger.exception(
                    "[CUT] failed to persist one question payload: run_id=%s paper_id=%s idx=%s",
                    run_id,
                    paper.id,
                    index,
                )
                db.rollback()
        return persisted_count

    def _can_persist_question_images(self, db: Session) -> bool:
        if self._question_images_table_available is not None:
            return self._question_images_table_available

        bind = db.get_bind()
        inspector = inspect(bind)
        self._question_images_table_available = inspector.has_table("question_images")
        if not self._question_images_table_available:
            logger.warning(
                "[CUT] question_images table is missing; image rows will be skipped. Run `alembic upgrade head`.")
        return self._question_images_table_available

    def _safe_float(self, value: Any, default: float) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return default


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
