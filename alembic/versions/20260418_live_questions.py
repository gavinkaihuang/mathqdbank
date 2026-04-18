"""create live_questions table

Revision ID: 20260418_live_questions
Revises: 20260404_question_img
Create Date: 2026-04-18 00:00:00

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260418_live_questions"
down_revision: Union[str, Sequence[str], None] = "20260404_question_img"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "live_questions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("parent_question_id", sa.Integer(), nullable=False),
        sa.Column("content_latex", sa.Text(), nullable=False),
        sa.Column("answer_latex", sa.Text(), nullable=True),
        sa.Column("question_type", sa.String(length=50), nullable=False),
        sa.Column("type_specific_data", sa.JSON(), nullable=True),
        sa.Column("generation_prompt", sa.Text(), nullable=True),
        sa.Column("irt_difficulty", sa.Float(), nullable=False, server_default="0.5"),
        sa.Column("total_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("correct_rate", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["parent_question_id"], ["questions.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_live_questions_id", "live_questions", ["id"], unique=False
    )
    op.create_index(
        "ix_live_questions_parent_question_id",
        "live_questions",
        ["parent_question_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_live_questions_parent_question_id", table_name="live_questions")
    op.drop_index("ix_live_questions_id", table_name="live_questions")
    op.drop_table("live_questions")
