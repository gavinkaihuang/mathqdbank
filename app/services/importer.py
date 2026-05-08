from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from google import genai
from google.genai.errors import APIError

from app.core.config import settings
from app.core.prisma_client import connect_prisma, prisma
from app.models.parsing import BookPageExtraction, ContentTypeEnum
from app.services.key_manager import KeyRelayClient

logger = logging.getLogger(__name__)

_EMBEDDING_MODEL = settings.EMBEDDING_MODEL
_EMBEDDING_DIM = 768
_DEBUG_DUMP_DIR = Path("runtime_logs/llm_debug")

_CONTENT_TYPE_TO_ITEM_TYPE = {
    ContentTypeEnum.METHOD: "SOLUTION_STRATEGY",
    ContentTypeEnum.TRAP: "COMMON_MISTAKE",
    ContentTypeEnum.TIP: "EXAMPLE",
    ContentTypeEnum.THEORY: "THEOREM",
}


def _vector_literal(values: list[float]) -> str:
    # pgvector accepts string literal like: [0.1,0.2,...]
    return "[" + ",".join(f"{value:.10f}" for value in values) + "]"


def _extract_key_and_id(key_data: dict[str, Any]) -> tuple[str, str | None]:
    api_key = str(key_data.get("key") or key_data.get("apiKey") or "").strip()
    key_id = str(key_data.get("keyId") or key_data.get("id") or "").strip() or None
    if not api_key:
        raise RuntimeError("Key relay returned empty Gemini API key")
    return api_key, key_id


async def _resolve_gemini_api_key() -> tuple[str, str | None]:
    if settings.GEMINI_API_KEY.strip():
        return settings.GEMINI_API_KEY.strip(), None

    key_data = await KeyRelayClient().get_key(platform="Gemini")
    return _extract_key_and_id(key_data)


def _llm_debug_enabled() -> bool:
    return settings.IS_DEBUG or settings.LLM_DEBUG_ENABLED


def _dump_llm_debug_payload(payload: dict[str, Any]) -> None:
    if not _llm_debug_enabled():
        return

    try:
        _DEBUG_DUMP_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
        file_name = f"embedding_{ts}_{uuid4().hex[:8]}.json"
        file_path = _DEBUG_DUMP_DIR / file_name
        file_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )
        logger.info("[IMPORTER] LLM debug payload saved: path=%s", file_path)
    except Exception:
        logger.exception("[IMPORTER] failed to save LLM debug payload")


async def _embed_text(
    client: genai.Client,
    text: str,
    *,
    key_id: str | None,
    debug_context: dict[str, Any] | None = None,
    model: str = _EMBEDDING_MODEL,
) -> list[float]:
    try:
        result = await client.aio.models.embed_content(
            model=model,
            contents=text,
            config={"output_dimensionality": _EMBEDDING_DIM},
        )
    except APIError as exc:
        if key_id:
            await KeyRelayClient().report_error(
                key_id=key_id,
                raw_error=f"HTTP_{exc.code} {exc.status}: {str(exc.message)[:500]}",
            )
        raise

    raw_values = None
    if result.embeddings and len(result.embeddings) > 0:
        raw_values = result.embeddings[0].values

    response_payload = None
    if hasattr(result, "model_dump"):
        response_payload = result.model_dump(exclude_none=True)

    _dump_llm_debug_payload(
        {
            "event": "embed_content_response",
            "model": model,
            "key_id": key_id,
            "text_length": len(text),
            "text_preview": text[: settings.LLM_DEBUG_MAX_TEXT_CHARS],
            "context": debug_context or {},
            "embedding_count": len(result.embeddings or []),
            "first_embedding_dim": len(raw_values) if isinstance(raw_values, list) else None,
            "response": response_payload,
        }
    )

    if not isinstance(raw_values, list):
        raise RuntimeError("Gemini embedding response missing embedding.values")

    vector = [float(v) for v in raw_values]
    if len(vector) != _EMBEDDING_DIM:
        raise RuntimeError(
            f"Unexpected embedding dimension: {len(vector)} (expected {_EMBEDDING_DIM})"
        )

    return vector


async def _execute_raw(query: str, parameters: list[Any]) -> Any:
    # prisma-client-py raw query expects a JSON-encoded parameters array.
    return await prisma._execute(  # type: ignore[attr-defined]
        method="execute_raw",
        arguments={
            "query": query,
            "parameters": json.dumps(parameters),
        },
    )


async def save_extraction_to_db(extraction: BookPageExtraction, kp_id: str) -> None:
    started = time.perf_counter()
    knowledge_point_id = int(kp_id)
    logger.info(
        "[IMPORTER] save started: kp_id=%s items=%s questions=%s",
        knowledge_point_id,
        len(extraction.items),
        len(extraction.questions),
    )

    await connect_prisma()
    api_key, key_id = await _resolve_gemini_api_key()
    gemini_client = genai.Client(api_key=api_key)
    logger.info(
        "[IMPORTER] key resolved: kp_id=%s key_source=%s",
        knowledge_point_id,
        "env" if key_id is None else "relay",
    )

    saved_items = 0
    saved_questions = 0
    try:
        for item_index, item in enumerate(extraction.items):
            content = item.latex_content.strip()
            if not content:
                continue

            embedding = await _embed_text(
                gemini_client,
                content,
                key_id=key_id,
                debug_context={
                    "kp_id": knowledge_point_id,
                    "item_index": item_index,
                    "item_content_type": item.content_type,
                },
            )
            item_type = _CONTENT_TYPE_TO_ITEM_TYPE[item.content_type]

            await _execute_raw(
                (
                    'INSERT INTO knowledge_items '
                    '(content, expert_note, item_type, embedding, knowledge_point_id) '
                    'VALUES ($1, $2, $3, $4::vector, $5)'
                ),
                [
                    content,
                    item.expert_note,
                    item_type,
                    _vector_literal(embedding),
                    knowledge_point_id,
                ],
            )
            saved_items += 1

        for question in extraction.questions:
            await _execute_raw(
                (
                    "INSERT INTO kp_questions "
                    "(stem, answer, difficulty, source, knowledge_point_id) "
                    "VALUES ($1, $2, $3, $4, $5)"
                ),
                [
                    question.body,
                    question.solution,
                    float(question.difficulty),
                    "gemini_importer",
                    knowledge_point_id,
                ],
            )
            saved_questions += 1

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        logger.info(
            "[IMPORTER] save finished: kp_id=%s items_saved=%s questions_saved=%s elapsed_ms=%s",
            knowledge_point_id,
            saved_items,
            saved_questions,
            elapsed_ms,
        )
    except Exception:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        logger.exception(
            "[IMPORTER] save failed: kp_id=%s items_saved=%s questions_saved=%s elapsed_ms=%s",
            knowledge_point_id,
            saved_items,
            saved_questions,
            elapsed_ms,
        )
        raise
