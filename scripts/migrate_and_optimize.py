from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from io import BytesIO
from pathlib import Path
from typing import Any

from minio.commonconfig import CopySource
from minio.error import S3Error
from PIL import Image, ImageOps
from sqlalchemy import create_engine, text
from tqdm import tqdm

# Allow running as: python scripts/migrate_and_optimize.py
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.core.config import settings
from app.services.minio_service import MinioService

logger = logging.getLogger("migrate_and_optimize")

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff"}
MAX_WIDTH = 1536
JPEG_QUALITY = 85


async def _execute_raw(query: str, parameters: list[Any]) -> Any:
    def _execute() -> int:
        with _db_engine.begin() as conn:
            result = conn.execute(text(_sql(query)), _to_named_params(parameters))
            return int(result.rowcount or 0)

    return await asyncio.to_thread(_execute)


async def _query_raw(query: str, parameters: list[Any]) -> list[dict[str, Any]]:
    def _query() -> list[dict[str, Any]]:
        with _db_engine.begin() as conn:
            rows = conn.execute(text(_sql(query)), _to_named_params(parameters)).mappings().all()
            return [dict(row) for row in rows]

    return await asyncio.to_thread(_query)


def _to_named_params(parameters: list[Any]) -> dict[str, Any]:
    # Convert positional $1, $2 ... style arguments to SQLAlchemy named params.
    return {f"p{i}": value for i, value in enumerate(parameters, start=1)}


def _sql(query: str) -> str:
    # Keep original query readability while adapting parameter markers.
    converted = query
    for idx in range(1, 30):
        converted = converted.replace(f"${idx}", f":p{idx}")
    return converted


_db_engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=1800,
    pool_timeout=30,
)


def _is_image_object(name: str) -> bool:
    suffix = Path(name).suffix.lower()
    return suffix in IMAGE_EXTENSIONS


def _optimized_path_from_raw(raw_path: str) -> str:
    raw_suffix = "raw/"
    relative = raw_path[len(raw_suffix) :] if raw_path.startswith(raw_suffix) else raw_path
    stem = Path(relative).stem
    parent = Path(relative).parent
    if str(parent) == ".":
        return f"optimized/{stem}.jpg"
    return f"optimized/{parent.as_posix()}/{stem}.jpg"


def _optimize_to_jpeg(source: bytes) -> bytes:
    with Image.open(BytesIO(source)) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        elif img.mode == "L":
            img = img.convert("RGB")

        width, height = img.size
        if width > MAX_WIDTH:
            new_height = int(height * (MAX_WIDTH / width))
            img = img.resize((MAX_WIDTH, new_height), Image.Resampling.LANCZOS)

        output = BytesIO()
        img.save(output, format="JPEG", quality=JPEG_QUALITY, optimize=True)
        return output.getvalue()


async def _object_exists(storage: MinioService, path: str) -> bool:
    def _stat() -> bool:
        try:
            storage.client.stat_object(storage.bucket_name, path)
            return True
        except S3Error as exc:
            if exc.code in {"NoSuchKey", "NoSuchObject", "NoSuchBucket"}:
                return False
            raise

    return await asyncio.to_thread(_stat)


async def _move_object(storage: MinioService, source: str, target: str) -> str:
    if source == target:
        return "skipped"

    source_exists = await _object_exists(storage, source)
    if not source_exists:
        return "missing"

    if await _object_exists(storage, target):
        await asyncio.to_thread(storage.client.remove_object, storage.bucket_name, source)
        return "cleaned"

    await asyncio.to_thread(
        storage.client.copy_object,
        storage.bucket_name,
        target,
        CopySource(storage.bucket_name, source),
    )
    await asyncio.to_thread(storage.client.remove_object, storage.bucket_name, source)
    return "moved"


async def _upsert_extraction_task(optimized_path: str, raw_path: str) -> None:
    await _execute_raw(
        (
            "INSERT INTO extraction_tasks (minio_path, status) VALUES ($1, 'PENDING') "
            "ON CONFLICT (minio_path) DO UPDATE SET status = 'PENDING', updated_at = NOW()"
        ),
        [optimized_path],
    )
    await _execute_raw(
        "DELETE FROM extraction_tasks WHERE minio_path = $1",
        [raw_path],
    )


async def _list_root_images(storage: MinioService) -> list[str]:
    def _list() -> list[str]:
        result: list[str] = []
        for obj in storage.client.list_objects(storage.bucket_name, recursive=False):
            name = (obj.object_name or "").strip()
            if not name or "/" in name:
                continue
            if _is_image_object(name):
                result.append(name)
        return result

    return await asyncio.to_thread(_list)


async def _list_raw_images(storage: MinioService) -> list[str]:
    def _list() -> list[str]:
        result: list[str] = []
        for obj in storage.client.list_objects(storage.bucket_name, prefix="raw/", recursive=True):
            name = (obj.object_name or "").strip()
            if not name or name.endswith("/"):
                continue
            if _is_image_object(name):
                result.append(name)
        return result

    return await asyncio.to_thread(_list)


async def migrate_root_to_raw(storage: MinioService, concurrency: int) -> dict[str, int]:
    root_images = await _list_root_images(storage)
    if not root_images:
        return {"total": 0, "moved": 0, "cleaned": 0, "missing": 0, "skipped": 0}

    sem = asyncio.Semaphore(concurrency)
    stats = {"total": len(root_images), "moved": 0, "cleaned": 0, "missing": 0, "skipped": 0}

    async def _worker(name: str) -> str:
        async with sem:
            return await _move_object(storage, name, f"raw/{name}")

    tasks = [asyncio.create_task(_worker(name)) for name in root_images]
    with tqdm(total=len(tasks), desc="Move root -> raw", unit="img") as pbar:
        for task in asyncio.as_completed(tasks):
            result = await task
            if result in stats:
                stats[result] += 1
            pbar.update(1)

    return stats


async def optimize_raw_images(storage: MinioService, concurrency: int) -> dict[str, int]:
    raw_images = await _list_raw_images(storage)
    if not raw_images:
        return {
            "total": 0,
            "optimized": 0,
            "skipped_existing": 0,
            "failed": 0,
            "db_synced": 0,
        }

    sem = asyncio.Semaphore(concurrency)
    stats = {
        "total": len(raw_images),
        "optimized": 0,
        "skipped_existing": 0,
        "failed": 0,
        "db_synced": 0,
    }

    async def _process_one(raw_path: str) -> tuple[str, str]:
        optimized_path = _optimized_path_from_raw(raw_path)
        async with sem:
            try:
                if await _object_exists(storage, optimized_path):
                    await _upsert_extraction_task(optimized_path, raw_path)
                    return "skipped_existing", optimized_path

                raw_bytes = await asyncio.to_thread(storage.get_object_bytes, raw_path)
                optimized_bytes = await asyncio.to_thread(_optimize_to_jpeg, raw_bytes)

                await asyncio.to_thread(
                    storage.client.put_object,
                    storage.bucket_name,
                    optimized_path,
                    BytesIO(optimized_bytes),
                    len(optimized_bytes),
                    "image/jpeg",
                )
                await _upsert_extraction_task(optimized_path, raw_path)
                return "optimized", optimized_path
            except Exception:
                logger.exception("Failed to process image: raw=%s optimized=%s", raw_path, optimized_path)
                return "failed", optimized_path

    tasks = [asyncio.create_task(_process_one(path)) for path in raw_images]
    with tqdm(total=len(tasks), desc="Optimize raw -> optimized", unit="img") as pbar:
        for task in asyncio.as_completed(tasks):
            result, _optimized_path = await task
            if result in stats:
                stats[result] += 1
            if result in {"optimized", "skipped_existing"}:
                stats["db_synced"] += 1
            pbar.update(1)

    return stats


async def _count_tasks() -> int:
    rows = await _query_raw("SELECT COUNT(*)::int AS count FROM extraction_tasks", [])
    if not rows:
        return 0
    value = rows[0].get("count", 0)
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


async def run(concurrency: int) -> None:
    storage = MinioService()
    storage.bucket_name = settings.MINIO_BUCKET_4_TUBOOK_NAME

    logger.info("Start migration for bucket=%s", storage.bucket_name)

    move_stats = await migrate_root_to_raw(storage, concurrency=concurrency)
    optimize_stats = await optimize_raw_images(storage, concurrency=concurrency)
    total_tasks = await _count_tasks()

    print("\n=== Summary ===")
    print(f"bucket: {storage.bucket_name}")
    print(f"move: {move_stats}")
    print(f"optimize: {optimize_stats}")
    print(f"extraction_tasks_count: {total_tasks}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Move root images to raw/, optimize to optimized/*.jpg, "
            "and sync extraction_tasks(minio_path,status)."
        )
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=8,
        help="Maximum concurrent image tasks (default: 8)",
    )
    return parser.parse_args()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    args = parse_args()
    concurrency = max(1, int(args.concurrency))

    asyncio.run(run(concurrency=concurrency))


if __name__ == "__main__":
    main()
