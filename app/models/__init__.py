"""Database models package."""

from app.models.domain import (
	PromptTemplate,
	Question,
	RawPaper,
	Tag,
	question_tag_association,
)

__all__ = [
	"RawPaper",
	"Question",
	"Tag",
	"PromptTemplate",
	"question_tag_association",
]