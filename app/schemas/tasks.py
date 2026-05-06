from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.parsing import BookPageExtraction


class ExtractionTaskResponse(BaseModel):
    id: int
    minio_path: str
    image_url: str | None = None
    image_presigned_url: str | None = None
    status: str
    json_result: dict[str, Any] | None = None
    error_log: str | None = None
    updated_at: datetime


class SyncTasksResponse(BaseModel):
    total_images: int
    created: int
    skipped: int


class RetryTaskRequest(BaseModel):
    kp_id: str = "1"


class UpdateTaskRequest(BaseModel):
    kp_id: str = "1"
    json_result: BookPageExtraction
    status: str = Field(default="DONE")


class DeleteTasksRequest(BaseModel):
    ids: list[int] = Field(default_factory=list)


class DeleteTasksResponse(BaseModel):
    deleted: int
