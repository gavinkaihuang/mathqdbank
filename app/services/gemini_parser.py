from __future__ import annotations

import filetype
import json
import logging
import time
from typing import Any

from google import genai
from google.genai import types

from app.core.config import settings
from app.models.parsing import BookPageExtraction
from app.services.key_manager import KeyRelayClient

logger = logging.getLogger(__name__)


_SYSTEM_PROMPT = """
你是一个资深的数学教研专家和 OCR 专家。

任务：
1. 识别截图中所有的知识片段和题目。
2. 所有数学公式和行内变量必须严格转换成 LaTeX 格式。
3. 图片中的红笔手写备注必须精准提取到 expert_note 字段。
4. 根据语境将知识片段分类为 METHOD（通性通法）、TRAP（易错点）、TIP（心得）或 THEORY（基础）。

输出要求：
- 只输出符合 BookPageExtraction 的 JSON 数据。
- 不要输出任何额外解释。
""".strip()


def _detect_mime_type(image_bytes: bytes) -> str:
    kind = filetype.guess(image_bytes)
    if kind is not None and kind.mime:
        return kind.mime
    return "image/jpeg"


class GeminiParserService:
    def __init__(self) -> None:
        model_name = (
            settings.MODEL_TIER_FLASH.strip()
            if settings.IS_DEBUG
            else settings.MODEL_TIER_PRO.strip()
        )
        if not model_name:
            raise RuntimeError(
                "MODEL_TIER_FLASH is required when IS_DEBUG=true"
                if settings.IS_DEBUG
                else "MODEL_TIER_PRO is required"
            )
        self.model_name = model_name
        self.key_id: str | None = None
        self.key_source = "env"
        self.api_key = ""

        api_key = settings.GEMINI_API_KEY.strip() if settings.GEMINI_API_KEY else ""
        if not api_key:
            key_data = KeyRelayClient().get_key_sync(platform="Gemini")
            api_key, key_id = _extract_key_and_id(key_data)
            self.key_id = key_id
            self.key_source = "relay"
        self.api_key = api_key

        logger.info(
            "[GEMINI] parser service initialized: model=%s is_debug=%s key_source=%s key_id=%s",
            self.model_name,
            settings.IS_DEBUG,
            self.key_source,
            self.key_id or "",
        )

        print(f"DEBUG: Selected Model is {self.model_name}")
        self.client = genai.Client(api_key=api_key)

    async def parse_math_page(self, image_bytes: bytes) -> BookPageExtraction:
        if not image_bytes:
            raise ValueError("image_bytes cannot be empty")

        mime_type = _detect_mime_type(image_bytes)
        started = time.perf_counter()
        logger.info(
            "[GEMINI] parse started: model=%s gemini_key=%s mime=%s image_bytes=%s",
            self.model_name,
            self.api_key,
            mime_type,
            len(image_bytes),
        )

        try:
            response = await self.client.aio.models.generate_content(
                model=self.model_name,
                contents=types.Content(
                    role="user",
                    parts=[
                        types.Part.from_text(
                            text="请解析这张数学页面截图，并按约定的 JSON Schema 返回。"
                        ),
                        types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    ],
                ),
                config=types.GenerateContentConfig(
                    system_instruction=_SYSTEM_PROMPT,
                    response_mime_type="application/json",
                    response_schema=BookPageExtraction,
                ),
            )

            if isinstance(response.parsed, BookPageExtraction):
                result = response.parsed
            elif response.parsed is not None:
                result = BookPageExtraction.model_validate(response.parsed)
            elif response.text:
                result = BookPageExtraction.model_validate(json.loads(response.text))
            else:
                raise RuntimeError("Gemini returned empty response")

            elapsed_ms = int((time.perf_counter() - started) * 1000)
            logger.info(
                "[GEMINI] parse finished: elapsed_ms=%s items=%s questions=%s",
                elapsed_ms,
                len(result.items),
                len(result.questions),
            )
            return result
        except Exception:
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            if self.key_id:
                try:
                    KeyRelayClient().report_error_sync(
                        key_id=self.key_id,
                        raw_error=f"GEMINI_PARSE_FAILED elapsed_ms={elapsed_ms}",
                    )
                except Exception:
                    logger.exception("[GEMINI] key relay report failed: key_id=%s", self.key_id)
            logger.exception("[GEMINI] parse failed: elapsed_ms=%s", elapsed_ms)
            raise


def _extract_key_and_id(key_data: dict[str, Any]) -> tuple[str, str | None]:
    api_key = str(key_data.get("key") or key_data.get("apiKey") or "").strip()
    key_id = str(key_data.get("keyId") or key_data.get("id") or "").strip() or None
    if not api_key:
        raise RuntimeError("Key relay returned empty Gemini API key")
    return api_key, key_id


_parser_service: GeminiParserService | None = None


def get_gemini_parser_service() -> GeminiParserService:
    global _parser_service
    if _parser_service is None:
        _parser_service = GeminiParserService()
    return _parser_service


async def parse_math_page(image_bytes: bytes) -> BookPageExtraction:
    service = get_gemini_parser_service()
    try:
        result = await service.parse_math_page(image_bytes)
        logger.info(
            "[GEMINI] parsed successfully: items=%s questions=%s",
            len(result.items),
            len(result.questions),
        )
        return result
    except Exception:
        logger.exception("[GEMINI] parse_math_page wrapper failed")
        raise
