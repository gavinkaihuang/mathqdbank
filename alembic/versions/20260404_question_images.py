"""create question images table

Revision ID: 20260404_question_img
Revises: 20260330_prompt_tpl
Create Date: 2026-04-04 00:00:00

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260404_question_img"
down_revision: Union[str, Sequence[str], None] = "20260330_prompt_tpl"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "question_images",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("question_id", sa.Integer(), nullable=True),
        sa.Column("image_url", sa.String(length=500), nullable=False),
        sa.Column("desc", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_question_images_id"), "question_images", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_question_images_id"), table_name="question_images")
    op.drop_table("question_images")
