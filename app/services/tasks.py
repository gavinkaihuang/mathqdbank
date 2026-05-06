from __future__ import annotations

import json
import logging
import time
from typing import Any

from prisma._raw_query import deserialize_raw_results

from app.core.config import settings
from app.core.prisma_client import connect_prisma, prisma
from app.models.parsing import BookPageExtraction
from app.services.gemini_parser import parse_math_page
from app.services.importer import save_extraction_to_db
from app.services.minio_service import MinioService

_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff"}
logger = logging.getLogger(__name__)


def _create_tubook_storage() -> MinioService:
    storage = MinioService()
    storage.bucket_name = settings.MINIO_BUCKET_4_TUBOOK_NAME
    return storage


def _attach_image_url(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    storage = _create_tubook_storage()
    enriched: list[dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        minio_path = item.get("minio_path")
        if isinstance(minio_path, str) and minio_path:
            item["image_url"] = storage.build_object_url(minio_path)
            try:
                item["image_presigned_url"] = storage.build_presigned_get_url(minio_path)
            except Exception:
                item["image_presigned_url"] = item["image_url"]
        else:
            item["image_url"] = None
            item["image_presigned_url"] = None
        enriched.append(item)
    return enriched


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


async def list_tasks(status: str | None = None) -> list[dict[str, Any]]:
    await connect_prisma()
    logger.info("[TASKS] list started: status=%s", status)

    if status:
        rows = await _query_raw(
            (
                "SELECT id, minio_path, status, json_result, error_log, updated_at "
                "FROM extraction_tasks WHERE status = $1 ORDER BY id DESC"
            ),
            [status],
        )
        logger.info("[TASKS] list finished: status=%s count=%s", status, len(rows))
        return _attach_image_url(rows)

    rows = await _query_raw(
        (
            "SELECT id, minio_path, status, json_result, error_log, updated_at "
            "FROM extraction_tasks ORDER BY id DESC"
        ),
        [],
    )
    logger.info("[TASKS] list finished: status=%s count=%s", status, len(rows))
    return _attach_image_url(rows)


async def get_task(task_id: int) -> dict[str, Any]:
    await connect_prisma()
    logger.info("[TASKS] get started: task_id=%s", task_id)
    rows = await _query_raw(
        (
            "SELECT id, minio_path, status, json_result, error_log, updated_at "
            "FROM extraction_tasks WHERE id = $1 LIMIT 1"
        ),
        [task_id],
    )
    if not rows:
        logger.warning("[TASKS] get not found: task_id=%s", task_id)
        raise ValueError("Task not found")
    logger.info("[TASKS] get finished: task_id=%s", task_id)
    return _attach_image_url(rows)[0]


async def sync_tasks_from_minio() -> dict[str, int]:
    await connect_prisma()
    started = time.perf_counter()

    storage = _create_tubook_storage()
    logger.info("[TASKS] sync started: bucket=%s", storage.bucket_name)
    objects = storage.client.list_objects(storage.bucket_name, recursive=True)

    image_paths: list[str] = []
    for obj in objects:
        path = (obj.object_name or "").strip()
        if not path:
            continue
        dot = path.rfind(".")
        suffix = path[dot:].lower() if dot >= 0 else ""
        if suffix in _IMAGE_EXTENSIONS:
            image_paths.append(path)

    rows = await _query_raw("SELECT minio_path FROM extraction_tasks", [])
    existing = {
        str(row.get("minio_path", ""))
        for row in rows
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

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "[TASKS] sync finished: bucket=%s total_images=%s created=%s skipped=%s elapsed_ms=%s",
        storage.bucket_name,
        len(image_paths),
        created,
        len(image_paths) - created,
        elapsed_ms,
    )
    return {
        "total_images": len(image_paths),
        "created": created,
        "skipped": len(image_paths) - created,
    }


async def retry_task(task_id: int, kp_id: str) -> dict[str, Any]:
    await connect_prisma()
    started = time.perf_counter()
    stage = "lookup_task"
    logger.info("[TASKS] retry started: task_id=%s kp_id=%s", task_id, kp_id)

    rows = await _query_raw(
        (
            "SELECT id, minio_path FROM extraction_tasks "
            "WHERE id = $1 LIMIT 1"
        ),
        [task_id],
    )
    if not rows:
        logger.warning("[TASKS] retry task not found: task_id=%s", task_id)
        raise ValueError("Task not found")

    minio_path = str(rows[0]["minio_path"])
    storage = _create_tubook_storage()
    logger.info(
        "[TASKS] retry task resolved: task_id=%s minio_path=%s bucket=%s",
        task_id,
        minio_path,
        storage.bucket_name,
    )

    await _execute_raw(
        "UPDATE extraction_tasks SET status = 'PROCESSING', error_log = NULL WHERE id = $1",
        [task_id],
    )
    logger.info("[TASKS] retry marked processing: task_id=%s", task_id)

    try:
        stage = "download_image"
        image_bytes = storage.get_object_bytes(minio_path)
        logger.info("[TASKS] retry image loaded: task_id=%s bytes=%s", task_id, len(image_bytes))

        stage = "gemini_parse"
        extraction = await parse_math_page(image_bytes)

        stage = "save_extraction"
        await save_extraction_to_db(extraction, kp_id)

        stage = "update_task_done"
        await _execute_raw(
            (
                "UPDATE extraction_tasks "
                "SET status = 'DONE', json_result = $1::jsonb, error_log = NULL "
                "WHERE id = $2"
            ),
            [extraction.model_dump_json(), task_id],
        )

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        logger.info(
            "[TASKS] retry finished: task_id=%s status=DONE items=%s questions=%s elapsed_ms=%s",
            task_id,
            len(extraction.items),
            len(extraction.questions),
            elapsed_ms,
        )

        return {
            "id": task_id,
            "minio_path": minio_path,
            "status": "DONE",
        }
    except Exception as exc:
        logger.exception(
            "[TASKS] retry failed: task_id=%s stage=%s minio_path=%s",
            task_id,
            stage,
            minio_path,
        )
        try:
            await _execute_raw(
                "UPDATE extraction_tasks SET status = 'FAILED', error_log = $1 WHERE id = $2",
                [str(exc), task_id],
            )
        except Exception:
            logger.exception("[TASKS] failed to update task status to FAILED: task_id=%s", task_id)
        raise


async def update_task_result(task_id: int, extraction: BookPageExtraction, kp_id: str, status: str) -> dict[str, Any]:
    await connect_prisma()
    started = time.perf_counter()
    logger.info("[TASKS] update started: task_id=%s kp_id=%s status=%s", task_id, kp_id, status)

    rows = await _query_raw(
        (
            "SELECT id, minio_path FROM extraction_tasks "
            "WHERE id = $1 LIMIT 1"
        ),
        [task_id],
    )
    if not rows:
        logger.warning("[TASKS] update task not found: task_id=%s", task_id)
        raise ValueError("Task not found")

    await save_extraction_to_db(extraction, kp_id)

    await _execute_raw(
        (
            "UPDATE extraction_tasks "
            "SET status = $1, json_result = $2::jsonb, error_log = NULL "
            "WHERE id = $3"
        ),
        [status, extraction.model_dump_json(), task_id],
    )

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "[TASKS] update finished: task_id=%s status=%s items=%s questions=%s elapsed_ms=%s",
        task_id,
        status,
        len(extraction.items),
        len(extraction.questions),
        elapsed_ms,
    )

    return {
        "id": task_id,
        "minio_path": str(rows[0]["minio_path"]),
        "status": status,
    }


async def delete_task(task_id: int) -> dict[str, int]:
    await connect_prisma()
    logger.info("[TASKS] delete started: task_id=%s", task_id)
    result = await _execute_raw(
        "DELETE FROM extraction_tasks WHERE id = $1",
        [task_id],
    )
    deleted = 0
    if isinstance(result, dict):
        deleted = int(result.get("data", {}).get("result") or 0)
    if deleted == 0:
        logger.warning("[TASKS] delete task not found: task_id=%s", task_id)
        raise ValueError("Task not found")
    logger.info("[TASKS] delete finished: task_id=%s deleted=%s", task_id, deleted)
    return {"deleted": deleted}


async def delete_tasks(ids: list[int]) -> dict[str, int]:
    await connect_prisma()
    logger.info("[TASKS] batch delete started: requested=%s", len(ids))
    if not ids:
        return {"deleted": 0}

    deleted = 0
    for task_id in ids:
        result = await _execute_raw(
            "DELETE FROM extraction_tasks WHERE id = $1",
            [task_id],
        )
        if isinstance(result, dict):
            deleted += int(result.get("data", {}).get("result") or 0)
    logger.info("[TASKS] batch delete finished: requested=%s deleted=%s", len(ids), deleted)
    return {"deleted": deleted}
