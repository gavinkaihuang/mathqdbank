"""replace source_url with page_urls on raw_papers

Revision ID: 20260329_page_urls
Revises: 20260329_qtype
Create Date: 2026-03-29 00:00:00

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260329_page_urls"
down_revision: Union[str, Sequence[str], None] = "20260329_qtype"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("raw_papers", "source_url")
    op.add_column(
        "raw_papers",
        sa.Column(
            "page_urls",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
    )
    op.alter_column("raw_papers", "page_urls", server_default=None)


def downgrade() -> None:
    op.drop_column("raw_papers", "page_urls")
    op.add_column(
        "raw_papers",
        sa.Column("source_url", sa.String(length=500), nullable=True),
    )
