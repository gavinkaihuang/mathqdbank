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
    kp_id: str = Field(..., description="Knowledge point ID")


class UpdateTaskRequest(BaseModel):
    kp_id: str = Field(..., description="Knowledge point ID")
    json_result: BookPageExtraction
    status: str = Field(default="DONE")


class TagTaskRequest(BaseModel):
    fallback_kp_id: str | None = Field(default=None, description="Fallback knowledge point ID")
    source: str | None = Field(default="sh_math", description="Source filter for knowledge points")


class TagTaskResponse(BaseModel):
    task_id: int
    knowledge_point_id: int
    knowledge_point_title: str
    knowledge_point_path: str | None = None
    confidence: float
    reason: str


class DeleteTasksRequest(BaseModel):
    ids: list[int] = Field(default_factory=list)


class DeleteTasksResponse(BaseModel):
    deleted: int
