from io import BytesIO
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.database import SessionLocal
from app.schemas import (
    RawPaperCreate,
    RawPaperResponse,
    RawPaperUpdate,
)
from app.schemas.pagination import PageResponse
from app.services.extractor import PaperExtractorService
from app.services import raw_papers as raw_paper_service
from app.services.storage import MinioClient


router = APIRouter(prefix="/raw-papers", tags=["raw_papers"])
DbSession = Annotated[Session, Depends(get_db)]


def _run_paper_extraction(paper_id: int) -> None:
    db = SessionLocal()
    try:
        PaperExtractorService().process_paper(paper_id=paper_id, db=db)
    finally:
        db.close()


@router.post("", response_model=RawPaperResponse, status_code=status.HTTP_201_CREATED)
def create_raw_paper(payload: RawPaperCreate, db: DbSession) -> RawPaperResponse:
    return raw_paper_service.create_raw_paper(db, payload)


@router.get("", response_model=PageResponse[RawPaperResponse])
def list_raw_papers(
    db: DbSession,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
) -> PageResponse[RawPaperResponse]:
    skip = (page - 1) * size
    items = raw_paper_service.list_raw_papers(db, skip=skip, limit=size)
    total = raw_paper_service.count_raw_papers(db)
    return PageResponse(items=items, total=total, page=page, size=size)


@router.get("/{raw_paper_id}", response_model=RawPaperResponse)
def get_raw_paper(raw_paper_id: int, db: DbSession) -> RawPaperResponse:
    raw_paper = raw_paper_service.get_raw_paper(db, raw_paper_id)
    if raw_paper is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Raw paper not found")
    return raw_paper


@router.patch("/{raw_paper_id}", response_model=RawPaperResponse)
def update_raw_paper(
    raw_paper_id: int, payload: RawPaperUpdate, db: DbSession
) -> RawPaperResponse:
    raw_paper = raw_paper_service.get_raw_paper(db, raw_paper_id)
    if raw_paper is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Raw paper not found")
    return raw_paper_service.update_raw_paper(db, raw_paper, payload)


@router.delete("/{raw_paper_id}", response_model=RawPaperResponse)
def delete_raw_paper(raw_paper_id: int, db: DbSession) -> RawPaperResponse:
    raw_paper = raw_paper_service.get_raw_paper(db, raw_paper_id)
    if raw_paper is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Raw paper not found")
    return raw_paper_service.delete_raw_paper(db, raw_paper)


@router.post("/upload", response_model=RawPaperResponse, status_code=status.HTTP_201_CREATED)
async def upload_raw_paper(
    title: Annotated[str, Form(...)],
    year: Annotated[int, Form(...)],
    files: Annotated[list[UploadFile], File(...)],
    background_tasks: BackgroundTasks,
    db: DbSession,
    paper_type: Annotated[str | None, Form()] = None,
) -> RawPaperResponse:
    minio_client = MinioClient()
    uploaded_paths: list[str] = []

    try:
        for file in files:
            if not file.filename:
                continue

            file_content = await file.read()
            file_obj = BytesIO(file_content)
            content_type = file.content_type or "application/octet-stream"

            object_path = minio_client.upload_file(
                file_obj=file_obj,
                original_filename=file.filename,
                content_type=content_type,
            )
            uploaded_paths.append(object_path)

        payload = RawPaperCreate(
            title=title,
            year=year,
            paper_type=paper_type,
            page_urls=uploaded_paths,
            status="pending",
        )
        raw_paper = raw_paper_service.create_raw_paper(db, payload)
        background_tasks.add_task(_run_paper_extraction, raw_paper.id)
        return raw_paper
    except Exception as exc:
        # Best-effort rollback when any upload step fails.
        if uploaded_paths:
            try:
                minio_client.delete_files(uploaded_paths)
            except Exception:
                pass

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to upload raw paper: {exc}",
        ) from exc