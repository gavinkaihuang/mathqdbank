"""migrate embedding column to pgvector

Revision ID: 20260509_migrate_to_pgvector
Revises: 20260508_knowledge_bank
Create Date: 2026-05-09 00:00:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "20260509_migrate_to_pgvector"
down_revision: Union[str, Sequence[str], None] = "20260508_knowledge_bank"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    
    # Migrate embedding column from FLOAT[] to vector(768)
    # Use raw SQL ALTER TABLE to change column type with USING clause
    # to properly cast float8[] values to vector format
    op.execute(
        """
        ALTER TABLE knowledge_items
        ALTER COLUMN embedding TYPE vector(768) USING embedding::text::vector
        """
    )


def downgrade() -> None:
    # Reverse: convert vector back to FLOAT[]
    op.execute(
        """
        ALTER TABLE knowledge_items
        ALTER COLUMN embedding TYPE float8[] USING embedding::float8[]
        """
    )
    
    # Drop pgvector extension if nothing else uses it
    op.execute("DROP EXTENSION IF EXISTS vector CASCADE")
