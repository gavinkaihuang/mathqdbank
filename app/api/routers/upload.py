from __future__ import annotations

import logging

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from minio.error import S3Error

from app.services.minio_service import MinioService

router = APIRouter(prefix="/upload", tags=["upload"])
logger = logging.getLogger(__name__)


@router.post("", status_code=status.HTTP_200_OK)
async def upload_file(file: UploadFile = File(...)) -> dict[str, object]:
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File name is required")

    logger.info(
        "[UPLOAD] request received: filename=%s content_type=%s",
        file.filename,
        file.content_type,
    )

    try:
        file_data = await file.read()
        if not file_data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty")

        service = MinioService()
        file_url = service.upload_file(
            file_data=file_data,
            file_name=file.filename,
            content_type=file.content_type or "application/octet-stream",
        )
        logger.info(
            "[UPLOAD] upload success: filename=%s bytes=%s url=%s",
            file.filename,
            len(file_data),
            file_url,
        )
    except ValueError as exc:
        logger.exception("[UPLOAD] invalid MinIO config: filename=%s", file.filename)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Invalid MinIO configuration: {exc}",
        ) from exc
    except S3Error as exc:
        logger.exception("[UPLOAD] MinIO upload failed: filename=%s", file.filename)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to upload file to MinIO: {exc}",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[UPLOAD] unexpected upload error: filename=%s", file.filename)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected upload error: {exc}",
        ) from exc

    return {
        "code": 200,
        "data": {
            "url": file_url,
            "filename": file.filename,
        },
    }
