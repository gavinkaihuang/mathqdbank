from enum import Enum

from pydantic import BaseModel, Field


class ContentTypeEnum(str, Enum):
    METHOD = "METHOD"
    TRAP = "TRAP"
    TIP = "TIP"
    THEORY = "THEORY"


class ExtractedItem(BaseModel):
    content_type: ContentTypeEnum
    latex_content: str
    expert_note: str | None = None


class ExtractedQuestion(BaseModel):
    body: str
    solution: str
    difficulty: int


class BookPageExtraction(BaseModel):
    items: list[ExtractedItem] = Field(default_factory=list)
    questions: list[ExtractedQuestion] = Field(default_factory=list)
