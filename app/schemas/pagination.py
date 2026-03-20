from math import ceil
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, computed_field

T = TypeVar("T")


class PageResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int

    @computed_field  # type: ignore[prop-decorator]
    @property
    def total_pages(self) -> int:
        if self.size <= 0:
            return 0
        return ceil(self.total / self.size)

    model_config = ConfigDict(from_attributes=True)
