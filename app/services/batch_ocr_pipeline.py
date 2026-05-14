from __future__ import annotations

import asyncio
import json
import logging
import random
import time
from dataclasses import dataclass
from typing import Any, Sequence

import filetype
import httpx
from google import genai
from google.genai import types
from google.genai.errors import APIError
from pydantic import BaseModel, ConfigDict, ValidationError

from app.core.config import settings
from app.core.exceptions import KeyRelayException
from app.models.parsing import BookPageExtraction

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


class BaseRelayResponse(BaseModel):
    success: bool
    code: str | None = None
    message: str | None = None


class RelayKeyData(BaseModel):
    keyId: str | None = None
    id: str | None = None
    key: str | None = None
    apiKey: str | None = None
    name: str | None = None
    keyName: str | None = None
    model_config = ConfigDict(extra="allow")


class DispatchKeyResponse(BaseRelayResponse):
    data: RelayKeyData | None = None


@dataclass(slots=True)
class OCRImageTask:
    image_id: str
    image_bytes: bytes
    mime_type: str | None = None
    prompt_text: str = "请解析这张数学页面截图，并按约定的 JSON Schema 返回。"
    metadata: dict[str, Any] | None = None


@dataclass(slots=True)
class OCRImageResult:
    image_id: str
    success: bool
    extraction: BookPageExtraction | None = None
    error: str | None = None
    attempts: int = 0
    key_id: str | None = None
    key_name: str | None = None
    metadata: dict[str, Any] | None = None


@dataclass(slots=True)
class DispatchedKey:
    api_key: str
    key_id: str
    key_name: str
    raw_payload: dict[str, Any]


class ExternalKeyRelayClient:
    def __init__(
        self,
        *,
        base_url: str | None = None,
        external_api_token: str | None = None,
        callback_secret: str | None = None,
        project_name: str = "mathqbank-ocr-worker",
        platform: str = "Gemini",
        timeout: float = 15.0,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = (base_url or settings.KEY_RELAY_BASE_URL).rstrip("/")
        self.external_api_token = (external_api_token or settings.KEYRELAY_EXTERNAL_API_TOKEN).strip()
        self.callback_secret = (callback_secret or settings.CALLBACK_SECRET).strip()
        self.project_name = project_name
        self.platform = platform
        self.timeout = httpx.Timeout(timeout)
        self._http_client = http_client

    async def dispatch_key(self) -> DispatchedKey:
        self._ensure_external_token()
        url = f"{self.base_url}/api/external/keys/dispatch"
        payload = {
            "platform": self.platform,
            "projectName": self.project_name,
        }
        headers = {
            "Content-Type": "application/json",
            "X-KeyRelay-Token": self.external_api_token,
        }
        response_data = await self._post_json(url, headers=headers, payload=payload)

        try:
            parsed = DispatchKeyResponse.model_validate(response_data)
        except ValidationError as exc:
            raise KeyRelayException("INVALID_RESPONSE", f"Invalid key relay dispatch response: {exc}") from exc

        if not parsed.success:
            raise KeyRelayException(
                parsed.code or "KEY_DISPATCH_FAILED",
                parsed.message or "Failed to dispatch key",
            )

        if parsed.data is None:
            raise KeyRelayException("INVALID_RESPONSE", "Key relay response missing data")

        raw_payload = parsed.data.model_dump(exclude_none=True)
        api_key = str(raw_payload.get("key") or raw_payload.get("apiKey") or "").strip()
        key_id = str(raw_payload.get("keyId") or raw_payload.get("id") or "").strip()
        key_name = str(raw_payload.get("name") or raw_payload.get("keyName") or key_id or "unknown").strip()
        if not api_key or not key_id:
            raise KeyRelayException("INVALID_RESPONSE", "Key relay returned empty apiKey or keyId")

        logger.info(
            "[BATCH_OCR] dispatch key success: key_id=%s key_name=%s project=%s",
            key_id,
            key_name,
            self.project_name,
        )
        return DispatchedKey(api_key=api_key, key_id=key_id, key_name=key_name, raw_payload=raw_payload)

    async def report_error(self, *, key_id: str, raw_error: str) -> None:
        self._ensure_callback_secret()
        url = f"{self.base_url}/api/keys/callback"
        payload = {
            "keyId": key_id,
            "projectName": self.project_name,
            "rawError": raw_error,
        }
        headers = {
            "Content-Type": "application/json",
            "x-callback-token": self.callback_secret,
        }

        try:
            response_data = await self._post_json(url, headers=headers, payload=payload)
            parsed = BaseRelayResponse.model_validate(response_data)
            if parsed.success:
                logger.info("[BATCH_OCR] callback success: key_id=%s raw_error=%s", key_id, raw_error)
            else:
                logger.warning(
                    "[BATCH_OCR] callback rejected: key_id=%s code=%s message=%s raw_error=%s",
                    key_id,
                    parsed.code,
                    parsed.message,
                    raw_error,
                )
        except Exception:
            logger.exception(
                "[BATCH_OCR] callback failed: key_id=%s raw_error=%s",
                key_id,
                raw_error,
            )

    async def _post_json(
        self,
        url: str,
        *,
        headers: dict[str, str],
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        client = self._http_client or httpx.AsyncClient(timeout=self.timeout)
        owns_client = self._http_client is None
        try:
            response = await client.post(url, headers=headers, json=payload)
        except httpx.HTTPError as exc:
            raise KeyRelayException("NETWORK_ERROR", f"Key relay request failed: {exc}") from exc
        finally:
            if owns_client:
                await client.aclose()

        logger.info("[BATCH_OCR] key relay response: endpoint=%s status=%s", url, response.status_code)
        try:
            data = response.json()
        except ValueError as exc:
            raise KeyRelayException(
                "INVALID_RESPONSE",
                f"Key relay returned invalid JSON with status {response.status_code}",
            ) from exc

        if not isinstance(data, dict):
            raise KeyRelayException("INVALID_RESPONSE", "Key relay response must be a JSON object")

        return data

    def _ensure_external_token(self) -> None:
        if not self.external_api_token:
            raise KeyRelayException("MISSING_EXTERNAL_API_TOKEN", "KEYRELAY_EXTERNAL_API_TOKEN is not configured")

    def _ensure_callback_secret(self) -> None:
        if not self.callback_secret:
            raise KeyRelayException("MISSING_CALLBACK_SECRET", "CALLBACK_SECRET is not configured")


class GeminiOCRBatchPipeline:
    def __init__(
        self,
        *,
        concurrency: int = 10,
        max_retries: int = 3,
        dispatch_backoff_base: float = 1.0,
        dispatch_backoff_cap: float = 8.0,
        retry_jitter_min: float = 0.15,
        retry_jitter_max: float = 0.75,
        model_name: str | None = None,
        key_relay_client: ExternalKeyRelayClient | None = None,
    ) -> None:
        selected_model = (model_name or self._resolve_model_name()).strip()
        if not selected_model:
            raise RuntimeError("MODEL_TIER_FLASH or MODEL_TIER_PRO must be configured")
        if concurrency <= 0:
            raise ValueError("concurrency must be greater than 0")
        if max_retries <= 0:
            raise ValueError("max_retries must be greater than 0")
        if retry_jitter_min < 0 or retry_jitter_max < retry_jitter_min:
            raise ValueError("retry jitter bounds are invalid")

        self.model_name = selected_model
        self.max_retries = max_retries
        self.dispatch_backoff_base = dispatch_backoff_base
        self.dispatch_backoff_cap = dispatch_backoff_cap
        self.retry_jitter_min = retry_jitter_min
        self.retry_jitter_max = retry_jitter_max
        self.key_relay_client = key_relay_client or ExternalKeyRelayClient()
        self._semaphore = asyncio.Semaphore(concurrency)

    async def process_images(self, images: Sequence[OCRImageTask]) -> list[OCRImageResult]:
        async def _guarded(task: OCRImageTask) -> OCRImageResult:
            async with self._semaphore:
                return await self.process_single_image(task)

        coroutines = [_guarded(image) for image in images]
        return await asyncio.gather(*coroutines)

    async def process_single_image(self, image: OCRImageTask, max_retries: int | None = None) -> OCRImageResult:
        if not image.image_bytes:
            return OCRImageResult(
                image_id=image.image_id,
                success=False,
                error="image_bytes cannot be empty",
                metadata=image.metadata,
            )

        attempts_limit = max_retries or self.max_retries
        mime_type = image.mime_type or _detect_mime_type(image.image_bytes)
        last_error: str | None = None

        for attempt in range(1, attempts_limit + 1):
            dispatch_started = time.perf_counter()
            try:
                dispatched_key = await self.key_relay_client.dispatch_key()
            except KeyRelayException as exc:
                last_error = str(exc)
                if exc.code == "NO_KEYS_AVAILABLE":
                    delay = min(self.dispatch_backoff_base * (2 ** (attempt - 1)), self.dispatch_backoff_cap)
                    logger.warning(
                        "[BATCH_OCR] no keys available: image_id=%s attempt=%s/%s delay=%.2fs code=%s",
                        image.image_id,
                        attempt,
                        attempts_limit,
                        delay,
                        exc.code,
                    )
                    await asyncio.sleep(delay)
                    continue
                if attempt >= attempts_limit:
                    break
                delay = min(self.dispatch_backoff_base * (2 ** (attempt - 1)), self.dispatch_backoff_cap)
                logger.warning(
                    "[BATCH_OCR] dispatch failed: image_id=%s attempt=%s/%s delay=%.2fs error=%s",
                    image.image_id,
                    attempt,
                    attempts_limit,
                    delay,
                    exc,
                )
                await asyncio.sleep(delay)
                continue

            dispatch_elapsed_ms = int((time.perf_counter() - dispatch_started) * 1000)
            logger.info(
                "[BATCH_OCR] image dispatch ready: image_id=%s attempt=%s/%s key_id=%s key_name=%s dispatch_elapsed_ms=%s",
                image.image_id,
                attempt,
                attempts_limit,
                dispatched_key.key_id,
                dispatched_key.key_name,
                dispatch_elapsed_ms,
            )

            started = time.perf_counter()
            try:
                extraction = await self._call_gemini(
                    api_key=dispatched_key.api_key,
                    image_bytes=image.image_bytes,
                    mime_type=mime_type,
                    prompt_text=image.prompt_text,
                )
                elapsed_ms = int((time.perf_counter() - started) * 1000)
                logger.info(
                    "[BATCH_OCR] image processed: image_id=%s attempt=%s/%s key_id=%s key_name=%s elapsed_ms=%s items=%s questions=%s",
                    image.image_id,
                    attempt,
                    attempts_limit,
                    dispatched_key.key_id,
                    dispatched_key.key_name,
                    elapsed_ms,
                    len(extraction.items),
                    len(extraction.questions),
                )
                return OCRImageResult(
                    image_id=image.image_id,
                    success=True,
                    extraction=extraction,
                    attempts=attempt,
                    key_id=dispatched_key.key_id,
                    key_name=dispatched_key.key_name,
                    metadata=image.metadata,
                )
            except Exception as exc:
                elapsed_ms = int((time.perf_counter() - started) * 1000)
                last_error = self._format_raw_error(exc=exc, elapsed_ms=elapsed_ms)
                logger.warning(
                    "[BATCH_OCR] image processing failed: image_id=%s attempt=%s/%s key_id=%s key_name=%s raw_error=%s",
                    image.image_id,
                    attempt,
                    attempts_limit,
                    dispatched_key.key_id,
                    dispatched_key.key_name,
                    last_error,
                )
                await self.key_relay_client.report_error(
                    key_id=dispatched_key.key_id,
                    raw_error=last_error,
                )
                if attempt >= attempts_limit:
                    break
                jitter = random.uniform(self.retry_jitter_min, self.retry_jitter_max)
                logger.info(
                    "[BATCH_OCR] retry scheduled: image_id=%s next_attempt=%s jitter=%.3fs key_id=%s key_name=%s",
                    image.image_id,
                    attempt + 1,
                    jitter,
                    dispatched_key.key_id,
                    dispatched_key.key_name,
                )
                await asyncio.sleep(jitter)

        return OCRImageResult(
            image_id=image.image_id,
            success=False,
            error=last_error or "OCR processing failed after retries",
            attempts=attempts_limit,
            metadata=image.metadata,
        )

    async def _call_gemini(
        self,
        *,
        api_key: str,
        image_bytes: bytes,
        mime_type: str,
        prompt_text: str,
    ) -> BookPageExtraction:
        client = genai.Client(api_key=api_key)
        response = await client.aio.models.generate_content(
            model=self.model_name,
            contents=types.Content(
                role="user",
                parts=[
                    types.Part.from_text(text=prompt_text),
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
            return response.parsed
        if response.parsed is not None:
            return BookPageExtraction.model_validate(response.parsed)
        if response.text:
            return BookPageExtraction.model_validate(json.loads(response.text))
        raise RuntimeError("Gemini returned empty response")

    def _resolve_model_name(self) -> str:
        return settings.MODEL_TIER_FLASH.strip() if settings.IS_DEBUG else settings.MODEL_TIER_PRO.strip()

    def _format_raw_error(self, *, exc: Exception, elapsed_ms: int) -> str:
        if isinstance(exc, APIError):
            return f"HTTP_{exc.code} {exc.status}: {str(exc.message)[:500]} elapsed_ms={elapsed_ms}"
        return f"{exc.__class__.__name__}: {str(exc)[:500]} elapsed_ms={elapsed_ms}"


async def process_math_images_batch(
    images: Sequence[OCRImageTask],
    *,
    concurrency: int = 10,
    max_retries: int = 3,
    model_name: str | None = None,
) -> list[OCRImageResult]:
    pipeline = GeminiOCRBatchPipeline(
        concurrency=concurrency,
        max_retries=max_retries,
        model_name=model_name,
    )
    return await pipeline.process_images(images)