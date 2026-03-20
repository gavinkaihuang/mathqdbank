from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Question, Tag
from app.schemas import QuestionCreate, QuestionUpdate


def create_question(db: Session, payload: QuestionCreate) -> Question:
    question = Question(**payload.model_dump())
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


def list_questions(db: Session, skip: int = 0, limit: int = 20) -> list[Question]:
    stmt = (
        select(Question)
        .options(selectinload(Question.tags))
        .offset(skip)
        .limit(limit)
    )
    return list(db.execute(stmt).scalars().all())


def search_questions(
    db: Session,
    skip: int = 0,
    limit: int = 20,
    tag_name: str | None = None,
    status: str | None = None,
) -> list[Question]:
    stmt = select(Question).options(selectinload(Question.tags))

    if tag_name:
        stmt = stmt.join(Question.tags).where(Tag.name == tag_name)

    if status:
        stmt = stmt.where(Question.status == status)

    stmt = stmt.distinct().offset(skip).limit(limit)
    return list(db.execute(stmt).scalars().all())


def get_question(db: Session, question_id: int) -> Question | None:
    stmt = (
        select(Question)
        .options(selectinload(Question.tags))
        .where(Question.id == question_id)
    )
    return db.execute(stmt).scalar_one_or_none()


def update_question(db: Session, question: Question, payload: QuestionUpdate) -> Question:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(question, field, value)

    db.add(question)
    db.commit()
    db.refresh(question)
    return question


def delete_question(db: Session, question: Question) -> Question:
    db.delete(question)
    db.commit()
    return question