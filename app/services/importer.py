from __future__ import annotations

import json
import logging
import time
from typing import Any

import httpx

from app.core.config import settings
from app.core.prisma_client import connect_prisma, prisma
from app.models.parsing import BookPageExtraction, ContentTypeEnum
from app.services.key_manager import KeyRelayClient

logger = logging.getLogger(__name__)

_EMBEDDING_MODEL = "text-embedding-004"
_EMBEDDING_DIM = 768

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


async def _embed_text(
    client: httpx.AsyncClient,
    text: str,
    *,
    api_key: str,
    key_id: str | None,
) -> list[float]:
    endpoint = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{_EMBEDDING_MODEL}:embedContent?key={api_key}"
    )
    payload = {
        "model": f"models/{_EMBEDDING_MODEL}",
        "content": {"parts": [{"text": text}]},
    }

    response = await client.post(endpoint, json=payload)
    if response.status_code >= 400:
        if key_id:
            await KeyRelayClient().report_error(
                key_id=key_id,
                raw_error=f"HTTP_{response.status_code}: {response.text[:500]}",
            )
        response.raise_for_status()

    data = response.json()
    raw_values = (
        data.get("embedding", {}).get("values")
        if isinstance(data, dict)
        else None
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
    logger.info(
        "[IMPORTER] key resolved: kp_id=%s key_source=%s",
        knowledge_point_id,
        "env" if key_id is None else "relay",
    )

    saved_items = 0
    saved_questions = 0
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            for item in extraction.items:
                content = item.latex_content.strip()
                if not content:
                    continue

                embedding = await _embed_text(
                    client,
                    content,
                    api_key=api_key,
                    key_id=key_id,
                )
                item_type = _CONTENT_TYPE_TO_ITEM_TYPE[item.content_type]

                await _execute_raw(
                    (
                        'INSERT INTO knowledge_items '
                        '(content, expert_note, item_type, embedding, knowledge_point_id) '
                        'VALUES ($1, $2, $3::"KnowledgeItemType", $4::vector, $5)'
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
                        "INSERT INTO questions "
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
