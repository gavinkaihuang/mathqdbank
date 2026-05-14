"""merge multiple heads

Revision ID: 1f596219b071
Revises: 20260509_kp_taxonomy, 20260514_add_ignore_fields_to_extraction_tasks
Create Date: 2026-05-14 16:34:42.716503

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa



# revision identifiers, used by Alembic.
revision: str = '1f596219b071'
down_revision: Union[str, Sequence[str], None] = ('20260509_kp_taxonomy', '20260514_add_ignore_fields_to_extraction_tasks')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass