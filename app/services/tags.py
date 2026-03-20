from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Tag
from app.schemas import TagCreate, TagUpdate


def create_tag(db: Session, payload: TagCreate) -> Tag:
    tag = Tag(**payload.model_dump())
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


def list_tags(db: Session, skip: int = 0, limit: int = 20) -> list[Tag]:
    stmt = select(Tag).offset(skip).limit(limit)
    return list(db.execute(stmt).scalars().all())


def get_tag(db: Session, tag_id: int) -> Tag | None:
    return db.get(Tag, tag_id)


def update_tag(db: Session, tag: Tag, payload: TagUpdate) -> Tag:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(tag, field, value)

    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


def delete_tag(db: Session, tag: Tag) -> Tag:
    db.delete(tag)
    db.commit()
    return tag


def count_tags(db: Session) -> int:
    return db.execute(select(func.count()).select_from(Tag)).scalar_one()