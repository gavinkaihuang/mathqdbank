"""create prompt templates table

Revision ID: 20260330_prompt_tpl
Revises: 20260329_page_urls
Create Date: 2026-03-30 00:00:00

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260330_prompt_tpl"
down_revision: Union[str, Sequence[str], None] = "20260329_page_urls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "prompt_templates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column("version", sa.String(length=50), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("model_routing_key", sa.String(length=50), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_prompt_templates_id"), "prompt_templates", ["id"], unique=False)
    op.create_index(op.f("ix_prompt_templates_name"), "prompt_templates", ["name"], unique=True)
    op.alter_column("prompt_templates", "is_active", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_prompt_templates_name"), table_name="prompt_templates")
    op.drop_index(op.f("ix_prompt_templates_id"), table_name="prompt_templates")
    op.drop_table("prompt_templates")
