"""extend knowledge_points for external taxonomy import

Revision ID: 20260509_kp_taxonomy
Revises: 20260509_migrate_to_pgvector
Create Date: 2026-05-09 00:30:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260509_kp_taxonomy"
down_revision: Union[str, Sequence[str], None] = "20260509_migrate_to_pgvector"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("knowledge_points", sa.Column("path", sa.String(length=255), nullable=True))
    op.add_column("knowledge_points", sa.Column("parent_id", sa.Integer(), nullable=True))
    op.add_column("knowledge_points", sa.Column("source", sa.String(length=100), nullable=True))
    op.add_column("knowledge_points", sa.Column("source_node_id", sa.Integer(), nullable=True))
    op.add_column("knowledge_points", sa.Column("stage", sa.String(length=100), nullable=True))
    op.add_column("knowledge_points", sa.Column("is_leaf", sa.Boolean(), nullable=True))

    op.create_index("ix_knowledge_points_path", "knowledge_points", ["path"], unique=False)
    op.create_index("ix_knowledge_points_parent_id", "knowledge_points", ["parent_id"], unique=False)
    op.create_index("ix_knowledge_points_source", "knowledge_points", ["source"], unique=False)
    op.create_index(
        "ix_knowledge_points_source_node_id",
        "knowledge_points",
        ["source", "source_node_id"],
        unique=False,
    )

    op.create_foreign_key(
        "fk_knowledge_points_parent_id",
        "knowledge_points",
        "knowledge_points",
        ["parent_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_knowledge_points_parent_id", "knowledge_points", type_="foreignkey")
    op.drop_index("ix_knowledge_points_source_node_id", table_name="knowledge_points")
    op.drop_index("ix_knowledge_points_source", table_name="knowledge_points")
    op.drop_index("ix_knowledge_points_parent_id", table_name="knowledge_points")
    op.drop_index("ix_knowledge_points_path", table_name="knowledge_points")

    op.drop_column("knowledge_points", "is_leaf")
    op.drop_column("knowledge_points", "stage")
    op.drop_column("knowledge_points", "source_node_id")
    op.drop_column("knowledge_points", "source")
    op.drop_column("knowledge_points", "parent_id")
    op.drop_column("knowledge_points", "path")
