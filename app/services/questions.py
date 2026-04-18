from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Question, Tag
from app.schemas import QuestionCreate, QuestionUpdate


_SUPPORTED_QUESTION_TYPES = ("choice", "fill", "judge", "essay")


def _resolve_tags(db: Session, tag_ids: list[int]) -> list[Tag]:
    """Fetch Tag objects for the given ids; raises BadRequestError on missing ids."""
    from app.core.exceptions import BadRequestError

    if not tag_ids:
        return []
    tags = list(db.execute(select(Tag).where(Tag.id.in_(tag_ids))).scalars().all())
    if len(tags) != len(set(tag_ids)):
        found = {t.id for t in tags}
        missing = sorted(set(tag_ids) - found)
        raise BadRequestError(f"Tag id(s) not found: {missing}")
    return tags


def create_question(db: Session, payload: QuestionCreate) -> Question:
    data = payload.model_dump(exclude={"tag_ids"})
    question = Question(**data)
    question.tags = _resolve_tags(db, payload.tag_ids)
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


def list_questions(
    db: Session,
    skip: int = 0,
    limit: int = 20,
    raw_paper_id: int | None = None,
    keyword: str | None = None,
) -> list[Question]:
    stmt = (
        select(Question)
        .where(Question.question_type.in_(_SUPPORTED_QUESTION_TYPES))
        .options(selectinload(Question.tags))
    )

    if raw_paper_id is not None:
        stmt = stmt.where(Question.raw_paper_id == raw_paper_id)

    if keyword:
        stmt = stmt.where(Question.content_latex.ilike(f"%{keyword}%"))

    stmt = stmt.offset(skip).limit(limit)
    return list(db.execute(stmt).scalars().all())


def search_questions(
    db: Session,
    skip: int = 0,
    limit: int = 20,
    tag_name: str | None = None,
    status: str | None = None,
) -> list[Question]:
    stmt = (
        select(Question)
        .where(Question.question_type.in_(_SUPPORTED_QUESTION_TYPES))
        .options(selectinload(Question.tags))
    )

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
    data = payload.model_dump(exclude_unset=True, exclude={"tag_ids"})
    for field, value in data.items():
        setattr(question, field, value)

    if payload.tag_ids is not None:
        question.tags = _resolve_tags(db, payload.tag_ids)

    db.add(question)
    db.commit()
    db.refresh(question)
    return question


def delete_question(db: Session, question: Question) -> Question:
    db.delete(question)
    db.commit()
    return question


def count_questions(
    db: Session,
    tag_name: str | None = None,
    status: str | None = None,
    raw_paper_id: int | None = None,
    keyword: str | None = None,
) -> int:
    stmt = (
        select(func.count())
        .select_from(Question)
        .where(Question.question_type.in_(_SUPPORTED_QUESTION_TYPES))
    )
    if tag_name:
        stmt = stmt.join(Question.tags).where(Tag.name == tag_name)
    if status:
        stmt = stmt.where(Question.status == status)
    if raw_paper_id is not None:
        stmt = stmt.where(Question.raw_paper_id == raw_paper_id)
    if keyword:
        stmt = stmt.where(Question.content_latex.ilike(f"%{keyword}%"))
    return db.execute(stmt).scalar_one()