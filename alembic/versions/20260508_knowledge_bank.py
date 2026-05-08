"""create knowledge bank tables

Revision ID: 20260508_knowledge_bank
Revises: 20260418_live_questions
Create Date: 2026-05-08 00:00:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260508_knowledge_bank"
down_revision: Union[str, Sequence[str], None] = "20260418_live_questions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # knowledge_points – parent entity for knowledge bank
    op.create_table(
        "knowledge_points",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("subject", sa.String(length=100), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_knowledge_points_id", "knowledge_points", ["id"], unique=False)

    # knowledge_items – content chunks with float array embeddings
    # Using FLOAT[] (built-in PostgreSQL) instead of vector type to avoid pgvector dependency.
    # Migrate to vector(768) later once pgvector is installed on the server.
    op.create_table(
        "knowledge_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("expert_note", sa.Text(), nullable=True),
        sa.Column(
            "item_type",
            sa.String(length=50),
            nullable=False,
        ),
        sa.Column("embedding", sa.ARRAY(sa.Float()), nullable=True),
        sa.Column("knowledge_point_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["knowledge_point_id"], ["knowledge_points.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_knowledge_items_id", "knowledge_items", ["id"], unique=False)
    op.create_index(
        "ix_knowledge_items_kp_id",
        "knowledge_items",
        ["knowledge_point_id"],
        unique=False,
    )
    # Add check constraint for item_type enum values
    op.execute(
        "ALTER TABLE knowledge_items ADD CONSTRAINT check_item_type "
        "CHECK (item_type IN ('SOLUTION_STRATEGY', 'COMMON_MISTAKE', 'EXAMPLE', 'THEOREM'))"
    )

    # kp_questions – extracted questions linked to knowledge points
    op.create_table(
        "kp_questions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("stem", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("difficulty", sa.Float(), nullable=True),
        sa.Column("source", sa.String(length=100), nullable=True),
        sa.Column("knowledge_point_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["knowledge_point_id"], ["knowledge_points.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_kp_questions_id", "kp_questions", ["id"], unique=False)
    op.create_index(
        "ix_kp_questions_kp_id", "kp_questions", ["knowledge_point_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_kp_questions_kp_id", table_name="kp_questions")
    op.drop_index("ix_kp_questions_id", table_name="kp_questions")
    op.drop_table("kp_questions")

    op.drop_index("ix_knowledge_items_kp_id", table_name="knowledge_items")
    op.drop_index("ix_knowledge_items_id", table_name="knowledge_items")
    op.drop_table("knowledge_items")

    op.drop_index("ix_knowledge_points_id", table_name="knowledge_points")
    op.drop_table("knowledge_points")
