"""Database models package."""

from app.models.domain import (
	PromptTemplate,
	Question,
	QuestionImage,
	RawPaper,
	Tag,
	question_tag_association,
)

__all__ = [
	"RawPaper",
	"Question",
	"QuestionImage",
	"Tag",
	"PromptTemplate",
	"question_tag_association",
]