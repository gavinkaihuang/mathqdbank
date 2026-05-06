from __future__ import annotations

import asyncio
import json
import os
from uuid import uuid4

from prisma._raw_query import deserialize_raw_results


prisma = None
connect_prisma = None
disconnect_prisma = None


def _normalize_database_url(database_url: str) -> str:
    if database_url.startswith("postgresql+psycopg2://"):
        return database_url.replace("postgresql+psycopg2://", "postgresql://", 1)
    return database_url


async def _execute_raw(query: str, parameters: list[object]) -> object:
    if prisma is None:
        raise RuntimeError("Prisma client is not initialized")
    return await prisma._execute(  # type: ignore[attr-defined]
        method="execute_raw",
        arguments={
            "query": query,
            "parameters": json.dumps(parameters),
        },
    )


async def _query_raw(query: str, parameters: list[object]) -> list[dict[str, object]]:
    if prisma is None:
        raise RuntimeError("Prisma client is not initialized")
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


async def main() -> None:
    global prisma, connect_prisma, disconnect_prisma

    current_database_url = os.getenv("DATABASE_URL", "").strip()
    if current_database_url:
        os.environ["DATABASE_URL"] = _normalize_database_url(current_database_url)

    try:
        from app.core.prisma_client import (
            connect_prisma as _connect_prisma,
            disconnect_prisma as _disconnect_prisma,
            prisma as _prisma,
        )
    except RuntimeError as exc:
        raise RuntimeError(
            "Prisma client is not generated. Run `prisma generate --schema prisma/schema.prisma` first."
        ) from exc

    prisma = _prisma
    connect_prisma = _connect_prisma
    disconnect_prisma = _disconnect_prisma

    test_path = f"healthcheck/{uuid4().hex}.png"

    if connect_prisma is None or disconnect_prisma is None:
        raise RuntimeError("Prisma connection helpers are not initialized")

    await connect_prisma()
    try:
        inserted = await _query_raw(
            (
                "INSERT INTO extraction_tasks (minio_path) "
                "VALUES ($1) "
                "RETURNING id, minio_path, status, updated_at"
            ),
            [test_path],
        )
        if not inserted:
            raise RuntimeError("Insert failed: no row returned")

        row = inserted[0]
        status = str(row.get("status", ""))
        if status != "PENDING":
            raise RuntimeError(
                f"Default status validation failed: expected PENDING, got {status!r}"
            )

        unique_index_ok = False
        try:
            await _execute_raw(
                "INSERT INTO extraction_tasks (minio_path) VALUES ($1)",
                [test_path],
            )
        except Exception:
            unique_index_ok = True

        if not unique_index_ok:
            raise RuntimeError(
                "Unique index validation failed: duplicate minio_path insert succeeded"
            )

        selected = await _query_raw(
            (
                "SELECT id, minio_path, status, updated_at "
                "FROM extraction_tasks WHERE minio_path = $1"
            ),
            [test_path],
        )
        if len(selected) != 1:
            raise RuntimeError(f"Read validation failed: expected 1 row, got {len(selected)}")

        print("[OK] extraction_tasks insert/read check passed")
        print(f"[OK] default status: {status}")
        print("[OK] unique index on minio_path is effective")
    finally:
        await _execute_raw(
            "DELETE FROM extraction_tasks WHERE minio_path = $1",
            [test_path],
        )
        await disconnect_prisma()


if __name__ == "__main__":
    asyncio.run(main())
