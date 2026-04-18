from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas import QuestionCreate, QuestionResponse, QuestionUpdate
from app.schemas.pagination import PageResponse
from app.services import questions as question_service


router = APIRouter(prefix="/questions", tags=["questions"])
DbSession = Annotated[Session, Depends(get_db)]


@router.post("", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
def create_question(payload: QuestionCreate, db: DbSession) -> QuestionResponse:
    question = question_service.create_question(db, payload)
    return question_service.get_question(db, question.id) or question


@router.get("", response_model=PageResponse[QuestionResponse])
def list_questions(
    db: DbSession,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    raw_paper_id: int | None = Query(default=None),
    keyword: str | None = Query(default=None),
) -> PageResponse[QuestionResponse]:
    skip = (page - 1) * size
    items = question_service.list_questions(
        db,
        skip=skip,
        limit=size,
        raw_paper_id=raw_paper_id,
        keyword=keyword,
    )
    total = question_service.count_questions(
        db,
        raw_paper_id=raw_paper_id,
        keyword=keyword,
    )
    return PageResponse(items=items, total=total, page=page, size=size)


@router.get("/search", response_model=PageResponse[QuestionResponse])
def search_questions(
    db: DbSession,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    tag_name: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
) -> PageResponse[QuestionResponse]:
    skip = (page - 1) * size
    items = question_service.search_questions(
        db, skip=skip, limit=size, tag_name=tag_name, status=status_filter
    )
    total = question_service.count_questions(db, tag_name=tag_name, status=status_filter)
    return PageResponse(items=items, total=total, page=page, size=size)


@router.get("/{question_id}", response_model=QuestionResponse)
def get_question(question_id: int, db: DbSession) -> QuestionResponse:
    question = question_service.get_question(db, question_id)
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    return question


@router.patch("/{question_id}", response_model=QuestionResponse)
def update_question(
    question_id: int, payload: QuestionUpdate, db: DbSession
) -> QuestionResponse:
    question = question_service.get_question(db, question_id)
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    question = question_service.update_question(db, question, payload)
    return question_service.get_question(db, question.id) or question


@router.delete("/{question_id}", response_model=QuestionResponse)
def delete_question(question_id: int, db: DbSession) -> QuestionResponse:
    question = question_service.get_question(db, question_id)
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    return question_service.delete_question(db, question)