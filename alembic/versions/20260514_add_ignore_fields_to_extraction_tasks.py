"""add ignore fields to extraction_tasks

Revision ID: 20260514_add_ignore_fields_to_extraction_tasks
Revises: 20260509_migrate_to_pgvector
Create Date: 2026-05-14 00:00:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260514_add_ignore_fields_to_extraction_tasks"
down_revision: Union[str, Sequence[str], None] = "20260509_migrate_to_pgvector"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "extraction_tasks",
        sa.Column("is_ignored", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("extraction_tasks", sa.Column("ignored_at", sa.DateTime(), nullable=True))
    op.create_index(
        "ix_extraction_tasks_is_ignored",
        "extraction_tasks",
        ["is_ignored"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_extraction_tasks_is_ignored", table_name="extraction_tasks")
    op.drop_column("extraction_tasks", "ignored_at")
    op.drop_column("extraction_tasks", "is_ignored")
