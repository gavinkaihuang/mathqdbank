from __future__ import annotations

import json
from typing import Any

from prisma._raw_query import deserialize_raw_results

from app.core.prisma_client import connect_prisma, prisma
from app.services.minio_service import MinioService

_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff"}


def _normalize_prefix(prefix: str) -> str:
    normalized = prefix.strip().lstrip("/")
    if normalized and not normalized.endswith("/"):
        normalized += "/"
    return normalized


async def _execute_raw(query: str, parameters: list[Any]) -> Any:
    return await prisma._execute(  # type: ignore[attr-defined]
        method="execute_raw",
        arguments={
            "query": query,
            "parameters": json.dumps(parameters),
        },
    )


async def _query_raw(query: str, parameters: list[Any]) -> list[dict[str, Any]]:
    raw = await prisma._execute(  # type: ignore[attr-defined]
        method="query_raw",
        arguments={
            "query": query,
            "parameters": json.dumps(parameters),
        },
    )
    if isinstance(raw, dict):
        payload = raw.get("data", {}).get("result") if isinstance(raw.get("data"), dict) else raw
        if isinstance(payload, dict) and {"columns", "types", "rows"}.issubset(payload.keys()):
            rows = deserialize_raw_results(payload)
            return [row for row in rows if isinstance(row, dict)]
    return []


async def sync_minio_to_tasks(bucket_name: str, prefix: str) -> dict[str, int]:
    """Sync image objects under MinIO prefix into extraction_tasks table."""
    await connect_prisma()

    storage = MinioService()
    normalized_prefix = _normalize_prefix(prefix)

    objects = storage.client.list_objects(
        bucket_name,
        prefix=normalized_prefix,
        recursive=True,
    )

    image_paths: list[str] = []
    for obj in objects:
        object_name = (obj.object_name or "").strip()
        if not object_name:
            continue

        dot = object_name.rfind(".")
        suffix = object_name[dot:].lower() if dot >= 0 else ""
        if suffix not in _IMAGE_EXTENSIONS:
            continue

        image_paths.append(object_name)

    if not image_paths:
        return {"total_images": 0, "created": 0, "skipped": 0}

    existing_rows = await _query_raw(
        "SELECT minio_path FROM extraction_tasks WHERE minio_path LIKE $1",
        [f"{normalized_prefix}%" if normalized_prefix else "%"],
    )
    existing = {
        str(row.get("minio_path", ""))
        for row in existing_rows
        if row.get("minio_path")
    }

    created = 0
    for path in image_paths:
        if path in existing:
            continue
        await _execute_raw(
            "INSERT INTO extraction_tasks (minio_path, status) VALUES ($1, 'PENDING')",
            [path],
        )
        created += 1

    return {
        "total_images": len(image_paths),
        "created": created,
        "skipped": len(image_paths) - created,
    }
