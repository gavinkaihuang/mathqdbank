from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas import QuestionCreate, QuestionResponse, QuestionUpdate
from app.services import questions as question_service


router = APIRouter(prefix="/api/v1/questions", tags=["questions"])
DbSession = Annotated[Session, Depends(get_db)]


@router.post("", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
def create_question(payload: QuestionCreate, db: DbSession) -> QuestionResponse:
    question = question_service.create_question(db, payload)
    return question_service.get_question(db, question.id) or question


@router.get("", response_model=list[QuestionResponse])
def list_questions(
    db: DbSession,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
) -> list[QuestionResponse]:
    return question_service.list_questions(db, skip=skip, limit=limit)


@router.get("/search", response_model=list[QuestionResponse])
def search_questions(
    db: DbSession,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    tag_name: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
) -> list[QuestionResponse]:
    return question_service.search_questions(
        db,
        skip=skip,
        limit=limit,
        tag_name=tag_name,
        status=status_filter,
    )


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