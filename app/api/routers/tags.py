from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas import TagCreate, TagResponse, TagUpdate
from app.services import tags as tag_service


router = APIRouter(prefix="/api/v1/tags", tags=["tags"])
DbSession = Annotated[Session, Depends(get_db)]


@router.post("", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
def create_tag(payload: TagCreate, db: DbSession) -> TagResponse:
    return tag_service.create_tag(db, payload)


@router.get("", response_model=list[TagResponse])
def list_tags(
    db: DbSession,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
) -> list[TagResponse]:
    return tag_service.list_tags(db, skip=skip, limit=limit)


@router.get("/{tag_id}", response_model=TagResponse)
def get_tag(tag_id: int, db: DbSession) -> TagResponse:
    tag = tag_service.get_tag(db, tag_id)
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")
    return tag


@router.patch("/{tag_id}", response_model=TagResponse)
def update_tag(tag_id: int, payload: TagUpdate, db: DbSession) -> TagResponse:
    tag = tag_service.get_tag(db, tag_id)
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")
    return tag_service.update_tag(db, tag, payload)


@router.delete("/{tag_id}", response_model=TagResponse)
def delete_tag(tag_id: int, db: DbSession) -> TagResponse:
    tag = tag_service.get_tag(db, tag_id)
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")
    return tag_service.delete_tag(db, tag)