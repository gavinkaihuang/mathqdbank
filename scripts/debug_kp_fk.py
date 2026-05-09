from __future__ import annotations

import argparse
import sys
from pathlib import Path

import sqlalchemy as sa

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.config import settings


def main() -> None:
    parser = argparse.ArgumentParser(description="Debug FK issue for knowledge_items.knowledge_point_id")
    parser.add_argument("--kp-id", type=int, default=1, help="knowledge point id to validate")
    args = parser.parse_args()

    engine = sa.create_engine(settings.DATABASE_URL)
    with engine.connect() as conn:
        tables = conn.execute(
            sa.text(
                "SELECT tablename FROM pg_tables WHERE schemaname='public' "
                "AND tablename IN ('knowledge_points', 'knowledge_items', 'kp_questions') ORDER BY tablename"
            )
        ).fetchall()
        print("tables:", [r[0] for r in tables])

        kps = conn.execute(
            sa.text("SELECT id, title FROM knowledge_points ORDER BY id LIMIT 20")
        ).fetchall()
        print("knowledge_points(sample):", [(r[0], r[1]) for r in kps])

        exists = conn.execute(
            sa.text("SELECT COUNT(*) FROM knowledge_points WHERE id = :kp_id"),
            {"kp_id": args.kp_id},
        ).scalar()
        print(f"kp_id={args.kp_id} exists:", bool(exists))

        if not exists:
            print(
                "diagnosis: FK will fail when inserting knowledge_items/kp_questions with this kp_id."
            )
            print(
                "fix: create a row in knowledge_points first, or pass a valid existing kp_id in retry/update request."
            )


if __name__ == "__main__":
    main()
