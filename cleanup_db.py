#!/usr/bin/env python3
import sqlalchemy as sa
from app.core.config import settings

engine = sa.create_engine(settings.DATABASE_URL)
with engine.connect() as conn:
    # Check if tables exist
    result = conn.execute(sa.text("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('knowledge_points', 'knowledge_items', 'kp_questions')"))
    tables = [r[0] for r in result]
    print(f"Existing tables: {tables}")
    
    if tables:
        for table in tables:
            conn.execute(sa.text(f"DROP TABLE IF EXISTS {table} CASCADE"))
            print(f"Dropped {table}")
    
    # Check enum
    result = conn.execute(sa.text("SELECT typname FROM pg_type WHERE typname = 'KnowledgeItemType'"))
    if result.fetchone():
        conn.execute(sa.text('DROP TYPE IF EXISTS "KnowledgeItemType" CASCADE'))
        print("Dropped KnowledgeItemType enum")
    
    conn.commit()
print("Cleanup complete")
