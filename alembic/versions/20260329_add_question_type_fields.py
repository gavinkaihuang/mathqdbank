"""add question type fields

Revision ID: 20260329_qtype
Revises:
Create Date: 2026-03-29 00:00:00

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260329_qtype"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "questions",
        sa.Column(
            "question_type",
            sa.String(length=50),
            nullable=False,
            server_default="essay",
        ),
    )
    op.add_column(
        "questions",
        sa.Column(
            "type_specific_data",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::json"),
        ),
    )
    op.alter_column("questions", "question_type", server_default=None)
    op.alter_column("questions", "type_specific_data", server_default=None)


def downgrade() -> None:
    op.drop_column("questions", "type_specific_data")
    op.drop_column("questions", "question_type")