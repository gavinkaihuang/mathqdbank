from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import LiveQuestion


def list_live_questions(
    db: Session, skip: int = 0, limit: int = 20
) -> list[LiveQuestion]:
    stmt = (
        select(LiveQuestion)
        .where(LiveQuestion.status == "active")
        .order_by(LiveQuestion.id.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(db.execute(stmt).scalars().all())


def count_live_questions(db: Session) -> int:
    stmt = select(func.count()).select_from(LiveQuestion).where(LiveQuestion.status == "active")
    return db.execute(stmt).scalar_one()
