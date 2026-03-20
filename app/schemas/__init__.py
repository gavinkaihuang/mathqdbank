"""Pydantic schemas package."""

from app.schemas.domain import (
	QuestionBase,
	QuestionCreate,
	QuestionResponse,
	QuestionUpdate,
	RawPaperBase,
	RawPaperCreate,
	RawPaperResponse,
	RawPaperUpdate,
	TagBase,
	TagCreate,
	TagResponse,
	TagUpdate,
)
from app.schemas.pagination import PageResponse

__all__ = [
	"RawPaperBase",
	"RawPaperCreate",
	"RawPaperUpdate",
	"RawPaperResponse",
	"QuestionBase",
	"QuestionCreate",
	"QuestionUpdate",
	"QuestionResponse",
	"TagBase",
	"TagCreate",
	"TagUpdate",
	"TagResponse",
	"PageResponse",
]