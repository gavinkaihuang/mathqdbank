from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import sqlalchemy as sa

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.config import settings


@dataclass
class SourceNode:
    id: int
    name: str
    path: str
    parent_id: int | None
    is_leaf: bool


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import external knowledge_nodes into local knowledge_points"
    )
    parser.add_argument(
        "--source-db-url",
        required=True,
        help="SQLAlchemy/PostgreSQL connection string for source database",
    )
    parser.add_argument(
        "--source-table",
        default="public.knowledge_nodes",
        help="Source table name, default: public.knowledge_nodes",
    )
    parser.add_argument(
        "--subject",
        default="高中数学",
        help="Subject value to write into knowledge_points.subject",
    )
    parser.add_argument(
        "--stage",
        default="高中",
        help="Stage value to write into knowledge_points.stage",
    )
    parser.add_argument(
        "--source-name",
        default="sh_math",
        help="Source tag to write into knowledge_points.source",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Optional limit for debugging",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview import result without writing target database",
    )
    return parser.parse_args()


def _split_table_name(table_name: str) -> tuple[str, str]:
    if "." in table_name:
        schema, table = table_name.split(".", 1)
        return schema, table
    return "public", table_name


def _load_source_nodes(engine: sa.Engine, source_table: str, limit: int) -> list[SourceNode]:
    schema, table = _split_table_name(source_table)
    limit_sql = f" LIMIT {limit}" if limit > 0 else ""
    query = sa.text(
        f"SELECT id, name, path FROM {schema}.{table} WHERE path IS NOT NULL ORDER BY id ASC{limit_sql}"
    )
    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()

    path_to_id = {str(row["path"]): int(row["id"]) for row in rows}
    nodes: list[SourceNode] = []
    for row in rows:
        node_id = int(row["id"])
        path = str(row["path"])
        parent_path = path.rsplit(".", 1)[0] if "." in path else None
        parent_id = path_to_id.get(parent_path) if parent_path else None
        prefix = f"{path}."
        is_leaf = not any(
            other_path != path and other_path.startswith(prefix) for other_path in path_to_id
        )
        nodes.append(
            SourceNode(
                id=node_id,
                name=str(row["name"]),
                path=path,
                parent_id=parent_id,
                is_leaf=is_leaf,
            )
        )
    return nodes


def _ensure_target_columns(engine: sa.Engine) -> None:
    query = sa.text(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'knowledge_points'
        """
    )
    with engine.connect() as conn:
        columns = {str(row[0]) for row in conn.execute(query).fetchall()}
    required = {"path", "parent_id", "source", "source_node_id", "stage", "is_leaf"}
    missing = sorted(required - columns)
    if missing:
        raise RuntimeError(
            "knowledge_points is missing required columns for taxonomy import: "
            + ", ".join(missing)
            + ". Run `alembic upgrade head` first."
        )


def _upsert_target_nodes(
    engine: sa.Engine,
    nodes: list[SourceNode],
    *,
    subject: str,
    stage: str,
    source_name: str,
) -> int:
    upsert_sql = sa.text(
        """
        INSERT INTO knowledge_points (
            id, title, subject, description, created_at,
            path, parent_id, source, source_node_id, stage, is_leaf
        ) VALUES (
            :id, :title, :subject, :description, NOW(),
            :path, :parent_id, :source, :source_node_id, :stage, :is_leaf
        )
        ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            subject = EXCLUDED.subject,
            description = EXCLUDED.description,
            path = EXCLUDED.path,
            parent_id = EXCLUDED.parent_id,
            source = EXCLUDED.source,
            source_node_id = EXCLUDED.source_node_id,
            stage = EXCLUDED.stage,
            is_leaf = EXCLUDED.is_leaf
        """
    )

    with engine.begin() as conn:
        for node in nodes:
            conn.execute(
                upsert_sql,
                {
                    "id": node.id,
                    "title": node.name,
                    "subject": subject,
                    "description": None,
                    "path": node.path,
                    "parent_id": node.parent_id,
                    "source": source_name,
                    "source_node_id": node.id,
                    "stage": stage,
                    "is_leaf": node.is_leaf,
                },
            )

        conn.execute(
            sa.text(
                """
                SELECT setval(
                    pg_get_serial_sequence('knowledge_points', 'id'),
                    COALESCE((SELECT MAX(id) FROM knowledge_points), 1),
                    true
                )
                """
            )
        )

    return len(nodes)


def main() -> None:
    args = _parse_args()
    source_engine = sa.create_engine(args.source_db_url, pool_pre_ping=True)
    target_engine = sa.create_engine(settings.DATABASE_URL, pool_pre_ping=True)

    _ensure_target_columns(target_engine)
    nodes = _load_source_nodes(source_engine, args.source_table, args.limit)
    if not nodes:
        print("No source nodes found. Nothing to import.")
        return

    print(f"source rows: {len(nodes)}")
    print("sample:", [(node.id, node.name, node.path, node.parent_id) for node in nodes[:5]])

    if args.dry_run:
        print("dry-run enabled, target database was not modified")
        return

    affected = _upsert_target_nodes(
        target_engine,
        nodes,
        subject=args.subject,
        stage=args.stage,
        source_name=args.source_name,
    )
    print(f"imported/upserted rows: {affected}")


if __name__ == "__main__":
    main()
