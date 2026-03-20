from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import RawPaper
from app.schemas import RawPaperCreate, RawPaperUpdate


def create_raw_paper(db: Session, payload: RawPaperCreate) -> RawPaper:
    raw_paper = RawPaper(**payload.model_dump())
    db.add(raw_paper)
    db.commit()
    db.refresh(raw_paper)
    return raw_paper


def list_raw_papers(db: Session, skip: int = 0, limit: int = 20) -> list[RawPaper]:
    stmt = select(RawPaper).offset(skip).limit(limit)
    return list(db.execute(stmt).scalars().all())


def get_raw_paper(db: Session, raw_paper_id: int) -> RawPaper | None:
    return db.get(RawPaper, raw_paper_id)


def update_raw_paper(
    db: Session, raw_paper: RawPaper, payload: RawPaperUpdate
) -> RawPaper:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(raw_paper, field, value)

    db.add(raw_paper)
    db.commit()
    db.refresh(raw_paper)
    return raw_paper


def delete_raw_paper(db: Session, raw_paper: RawPaper) -> RawPaper:
    db.delete(raw_paper)
    db.commit()
    return raw_paper


def count_raw_papers(db: Session) -> int:
    return db.execute(select(func.count()).select_from(RawPaper)).scalar_one()