from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.domain import (
    PromptTemplateCreate,
    PromptTemplateResponse,
    PromptTemplateUpdate,
)
from app.schemas.pagination import PageResponse
from app.services import prompts as prompt_service

router = APIRouter(prefix="/prompts", tags=["prompts"])
DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=PageResponse[PromptTemplateResponse])
def list_prompts(
    db: DbSession,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=50, ge=1, le=100),
) -> PageResponse[PromptTemplateResponse]:
    skip = (page - 1) * size
    items = prompt_service.list_prompt_templates(db, skip=skip, limit=size)
    total = prompt_service.count_prompt_templates(db)
    return PageResponse(items=items, total=total, page=page, size=size)


@router.get("/{prompt_id}", response_model=PromptTemplateResponse)
def get_prompt(prompt_id: int, db: DbSession) -> PromptTemplateResponse:
    template = prompt_service.get_prompt_template(db, prompt_id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt template not found")
    return template


@router.post("", response_model=PromptTemplateResponse, status_code=status.HTTP_201_CREATED)
def create_prompt(payload: PromptTemplateCreate, db: DbSession) -> PromptTemplateResponse:
    if prompt_service.get_prompt_template_by_name(db, payload.name):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Prompt template with name '{payload.name}' already exists",
        )
    return prompt_service.create_prompt_template(db, payload)


@router.patch("/{prompt_id}", response_model=PromptTemplateResponse)
def update_prompt(
    prompt_id: int,
    payload: PromptTemplateUpdate,
    db: DbSession,
) -> PromptTemplateResponse:
    template = prompt_service.get_prompt_template(db, prompt_id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt template not found")

    if payload.name and payload.name != template.name:
        existing = prompt_service.get_prompt_template_by_name(db, payload.name)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Prompt template with name '{payload.name}' already exists",
            )

    return prompt_service.update_prompt_template(db, template, payload)


@router.delete("/{prompt_id}", response_model=PromptTemplateResponse)
def delete_prompt(prompt_id: int, db: DbSession) -> PromptTemplateResponse:
    template = prompt_service.get_prompt_template(db, prompt_id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt template not found")
    return prompt_service.delete_prompt_template(db, template)
