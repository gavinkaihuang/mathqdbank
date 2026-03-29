from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class TagBase(BaseModel):
    name: str
    category: str = "knowledge"


class TagCreate(TagBase):
    pass


class TagUpdate(BaseModel):
    name: str | None = None
    category: str | None = None


class TagResponse(TagBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class RawPaperBase(BaseModel):
    title: str
    year: int
    paper_type: str | None = None
    page_urls: list[str] = Field(default_factory=list)
    status: str = "pending"


class RawPaperCreate(RawPaperBase):
    pass


class RawPaperUpdate(BaseModel):
    title: str | None = None
    year: int | None = None
    paper_type: str | None = None
    page_urls: list[str] | None = None
    status: str | None = None


class RawPaperResponse(RawPaperBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PromptTemplateBase(BaseModel):
    name: str
    description: str
    version: str
    content: str
    model_routing_key: str
    is_active: bool = False


class PromptTemplateCreate(PromptTemplateBase):
    pass


class PromptTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    version: str | None = None
    content: str | None = None
    model_routing_key: str | None = None
    is_active: bool | None = None


class PromptTemplateResponse(PromptTemplateBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class QuestionTypeEnum(str, Enum):
    CHOICE = "choice"
    FILL = "fill"
    JUDGE = "judge"
    ESSAY = "essay"


class QuestionBase(BaseModel):
    problem_number: str | None = None
    question_type: QuestionTypeEnum
    type_specific_data: dict[str, Any] = Field(default_factory=dict)
    content_latex: str
    answer_latex: str | None = None
    image_url: str | None = None
    difficulty: float | None = None
    elo_anchor: int = 1500
    status: str = "pending_review"


class QuestionCreate(QuestionBase):
    raw_paper_id: int
    tag_ids: list[int] = Field(default_factory=list)


class QuestionUpdate(BaseModel):
    raw_paper_id: int | None = None
    problem_number: str | None = None
    question_type: QuestionTypeEnum | None = None
    type_specific_data: dict[str, Any] | None = None
    content_latex: str | None = None
    answer_latex: str | None = None
    image_url: str | None = None
    difficulty: float | None = None
    elo_anchor: int | None = None
    status: str | None = None
    tag_ids: list[int] | None = None


class QuestionResponse(QuestionBase):
    id: int
    raw_paper_id: int
    created_at: datetime
    updated_at: datetime
    tags: list[TagResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)