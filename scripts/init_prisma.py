from __future__ import annotations

import os
import subprocess
from pathlib import Path
from urllib.parse import ParseResult, urlparse, urlunparse


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PRISMA_DIR = PROJECT_ROOT / "prisma"
PRISMA_ENV_FILE = PRISMA_DIR / ".env"
PRISMA_SCHEMA_FILE = PRISMA_DIR / "schema.prisma"
PRISMA_EXTENSIONS_SQL = PRISMA_DIR / "init_extensions.sql"


def _normalize_database_url(database_url: str) -> str:
    """Convert SQLAlchemy URLs to Prisma-compatible Postgres URLs."""
    parsed = urlparse(database_url)
    if parsed.scheme.startswith("postgresql+"):
        scheme = "postgresql"
        parsed = ParseResult(
            scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            parsed.query,
            parsed.fragment,
        )
    if parsed.scheme not in {"postgresql", "postgres"}:
        raise ValueError("DATABASE_URL must be a PostgreSQL URL for Prisma")
    return urlunparse(parsed)


def _write_prisma_env(database_url: str) -> None:
    PRISMA_DIR.mkdir(parents=True, exist_ok=True)
    PRISMA_ENV_FILE.write_text(
        f'DATABASE_URL="{database_url}"\n', encoding="utf-8"
    )


def _run(command: list[str]) -> None:
    env = os.environ.copy()
    env["DATABASE_URL"] = _normalize_database_url(env["DATABASE_URL"])
    subprocess.run(command, cwd=PROJECT_ROOT, env=env, check=True)


def main() -> None:
    raw_url = os.getenv("DATABASE_URL")
    if not raw_url:
        raise RuntimeError("Missing DATABASE_URL environment variable")

    prisma_db_url = _normalize_database_url(raw_url)
    _write_prisma_env(prisma_db_url)

    # Ensure pgvector extension is present before Prisma applies schema.
    _run([
        "prisma",
        "db",
        "execute",
        "--schema",
        str(PRISMA_SCHEMA_FILE),
        "--file",
        str(PRISMA_EXTENSIONS_SQL),
    ])

    _run(["prisma", "generate", "--schema", str(PRISMA_SCHEMA_FILE)])
    _run(["prisma", "db", "push", "--schema", str(PRISMA_SCHEMA_FILE)])


if __name__ == "__main__":
    main()
