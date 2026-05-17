"""Application model exports."""

from importlib import import_module
from typing import Any


__all__ = [
	"LiveQuestion",
	"RawPaper",
	"Question",
	"QuestionImage",
	"Tag",
	"PromptTemplate",
	"question_tag_association",
	"ContentTypeEnum",
	"ExtractedItem",
	"ExtractedQuestion",
	"BookPageExtraction",
]


_EXPORT_MODULES = {
	"LiveQuestion": "app.models.domain",
	"RawPaper": "app.models.domain",
	"Question": "app.models.domain",
	"QuestionImage": "app.models.domain",
	"Tag": "app.models.domain",
	"PromptTemplate": "app.models.domain",
	"question_tag_association": "app.models.domain",
	"ContentTypeEnum": "app.models.parsing",
	"ExtractedItem": "app.models.parsing",
	"ExtractedQuestion": "app.models.parsing",
	"BookPageExtraction": "app.models.parsing",
}


def __getattr__(name: str) -> Any:
	module_name = _EXPORT_MODULES.get(name)
	if module_name is None:
		raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

	module = import_module(module_name)
	value = getattr(module, name)
	globals()[name] = value
	return value