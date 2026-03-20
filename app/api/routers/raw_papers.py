from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas import (
    RawPaperCreate,
    RawPaperResponse,
    RawPaperUpdate,
)
from app.schemas.pagination import PageResponse
from app.services import raw_papers as raw_paper_service


router = APIRouter(prefix="/raw-papers", tags=["raw_papers"])
DbSession = Annotated[Session, Depends(get_db)]


@router.post("", response_model=RawPaperResponse, status_code=status.HTTP_201_CREATED)
def create_raw_paper(payload: RawPaperCreate, db: DbSession) -> RawPaperResponse:
    return raw_paper_service.create_raw_paper(db, payload)


@router.get("", response_model=PageResponse[RawPaperResponse])
def list_raw_papers(
    db: DbSession,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
) -> PageResponse[RawPaperResponse]:
    skip = (page - 1) * size
    items = raw_paper_service.list_raw_papers(db, skip=skip, limit=size)
    total = raw_paper_service.count_raw_papers(db)
    return PageResponse(items=items, total=total, page=page, size=size)


@router.get("/{raw_paper_id}", response_model=RawPaperResponse)
def get_raw_paper(raw_paper_id: int, db: DbSession) -> RawPaperResponse:
    raw_paper = raw_paper_service.get_raw_paper(db, raw_paper_id)
    if raw_paper is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Raw paper not found")
    return raw_paper


@router.patch("/{raw_paper_id}", response_model=RawPaperResponse)
def update_raw_paper(
    raw_paper_id: int, payload: RawPaperUpdate, db: DbSession
) -> RawPaperResponse:
    raw_paper = raw_paper_service.get_raw_paper(db, raw_paper_id)
    if raw_paper is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Raw paper not found")
    return raw_paper_service.update_raw_paper(db, raw_paper, payload)


@router.delete("/{raw_paper_id}", response_model=RawPaperResponse)
def delete_raw_paper(raw_paper_id: int, db: DbSession) -> RawPaperResponse:
    raw_paper = raw_paper_service.get_raw_paper(db, raw_paper_id)
    if raw_paper is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Raw paper not found")
    return raw_paper_service.delete_raw_paper(db, raw_paper)