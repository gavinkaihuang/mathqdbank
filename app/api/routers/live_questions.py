from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas import LiveQuestionResponse
from app.schemas.pagination import PageResponse
from app.services import live_questions as live_question_service


router = APIRouter(prefix="/live-questions", tags=["live-questions"])
DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=PageResponse[LiveQuestionResponse])
def list_live_questions(
    db: DbSession,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
) -> PageResponse[LiveQuestionResponse]:
    skip = (page - 1) * size
    items = live_question_service.list_live_questions(db, skip=skip, limit=size)
    total = live_question_service.count_live_questions(db)
    return PageResponse(items=items, total=total, page=page, size=size)
