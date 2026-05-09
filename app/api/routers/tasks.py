from typing import Any

from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.tasks import (
    DeleteTasksRequest,
    DeleteTasksResponse,
    ExtractionTaskResponse,
    RetryTaskRequest,
    SyncTasksResponse,
    TagTaskRequest,
    TagTaskResponse,
    UpdateTaskRequest,
)
from app.services import tasks as task_service


router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[ExtractionTaskResponse])
async def list_tasks(status_filter: str | None = Query(default=None, alias="status")) -> list[ExtractionTaskResponse]:
    rows = await task_service.list_tasks(status_filter)
    return [ExtractionTaskResponse.model_validate(row) for row in rows]


@router.get("/{task_id}", response_model=ExtractionTaskResponse)
async def get_task(task_id: int) -> ExtractionTaskResponse:
    try:
        row = await task_service.get_task(task_id)
        return ExtractionTaskResponse.model_validate(row)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/sync", response_model=SyncTasksResponse, status_code=status.HTTP_201_CREATED)
async def sync_tasks() -> SyncTasksResponse:
    result = await task_service.sync_tasks_from_minio()
    return SyncTasksResponse(**result)


@router.post("/{task_id}/retry")
async def retry_task(task_id: int, payload: RetryTaskRequest) -> dict[str, Any]:
    try:
        return await task_service.retry_task(task_id=task_id, kp_id=payload.kp_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


@router.post("/{task_id}/tag", response_model=TagTaskResponse)
async def auto_tag_task(task_id: int, payload: TagTaskRequest) -> TagTaskResponse:
    try:
        result = await task_service.auto_tag_task(
            task_id=task_id,
            fallback_kp_id=payload.fallback_kp_id,
            source=payload.source,
        )
        return TagTaskResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


@router.put("/{task_id}")
async def update_task(task_id: int, payload: UpdateTaskRequest) -> dict[str, Any]:
    try:
        return await task_service.update_task_result(
            task_id=task_id,
            extraction=payload.json_result,
            kp_id=payload.kp_id,
            status=payload.status,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


@router.delete("/{task_id}")
async def delete_task(task_id: int) -> DeleteTasksResponse:
    try:
        result = await task_service.delete_task(task_id)
        return DeleteTasksResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


@router.post("/delete-batch")
async def delete_tasks(payload: DeleteTasksRequest) -> DeleteTasksResponse:
    try:
        result = await task_service.delete_tasks(payload.ids)
        return DeleteTasksResponse(**result)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
