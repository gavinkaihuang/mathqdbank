from datetime import datetime

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
    source_url: str | None = None
    status: str = "pending"


class RawPaperCreate(RawPaperBase):
    pass


class RawPaperUpdate(BaseModel):
    title: str | None = None
    year: int | None = None
    paper_type: str | None = None
    source_url: str | None = None
    status: str | None = None


class RawPaperResponse(RawPaperBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class QuestionBase(BaseModel):
    problem_number: str | None = None
    content_latex: str
    answer_latex: str | None = None
    image_url: str | None = None
    difficulty: float | None = None
    elo_anchor: int = 1500
    status: str = "pending_review"


class QuestionCreate(QuestionBase):
    raw_paper_id: int


class QuestionUpdate(BaseModel):
    raw_paper_id: int | None = None
    problem_number: str | None = None
    content_latex: str | None = None
    answer_latex: str | None = None
    image_url: str | None = None
    difficulty: float | None = None
    elo_anchor: int | None = None
    status: str | None = None


class QuestionResponse(QuestionBase):
    id: int
    raw_paper_id: int
    created_at: datetime
    updated_at: datetime
    tags: list[TagResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)