from typing import Annotated
import logging
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.database import SessionLocal
from app.schemas import (
    RawPaperQaQuestionItem,
    RawPaperQaResponse,
    RawPaperCreate,
    RawPaperRecropRequest,
    RawPaperRecropResponse,
    RawPaperResponse,
    RawPaperUpdate,
)
from app.schemas.pagination import PageResponse
from app.models import Question, QuestionImage
from app.services.exam_paper_decomposer import ExamPaperDecomposer
from app.services.extractor import PaperExtractorService
from app.services.minio_service import MinioService
from app.services import raw_papers as raw_paper_service
from app.services import extraction_runtime


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/raw-papers", tags=["raw_papers"])
DbSession = Annotated[Session, Depends(get_db)]


def _run_paper_extraction(paper_id: int) -> None:
    db = SessionLocal()
    try:
        logger.info("[CUT] background task started: paper_id=%s", paper_id)
        PaperExtractorService().process_paper(paper_id=paper_id, db=db)
        logger.info("[CUT] background task finished: paper_id=%s", paper_id)
    except Exception:
        logger.exception("[CUT] background task crashed: paper_id=%s", paper_id)
        raise
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


@router.get("/{raw_paper_id}", response_model=RawPaperQaResponse)
def get_raw_paper(raw_paper_id: int, db: DbSession) -> RawPaperQaResponse:
    raw_paper = raw_paper_service.get_raw_paper(db, raw_paper_id)
    if raw_paper is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Raw paper not found")

    storage = MinioService()
    original_object = (raw_paper.page_urls or [None])[0]
    original_url = storage.build_object_url(original_object) if original_object else None
    original_urls = [storage.build_object_url(obj) for obj in (raw_paper.page_urls or []) if obj]

    questions = db.execute(
        select(Question)
        .where(Question.raw_paper_id == raw_paper.id)
        .order_by(Question.problem_number.asc().nullslast(), Question.id.asc())
    ).scalars().all()

    question_items: list[RawPaperQaQuestionItem] = []
    for q in questions:
        crop_urls = [storage.build_object_url(img.image_url) for img in (q.images or []) if img.image_url]
        primary_object = q.image_url or ((q.images[0].image_url if q.images else None) if q.images is not None else None)
        question_items.append(
            RawPaperQaQuestionItem(
                id=q.id,
                problem_number=q.problem_number,
                question_type=q.question_type,
                image_url=storage.build_object_url(primary_object) if primary_object else None,
                crop_urls=crop_urls,
            )
        )

    return RawPaperQaResponse(
        id=raw_paper.id,
        title=raw_paper.title,
        year=raw_paper.year,
        paper_type=raw_paper.paper_type,
        page_urls=raw_paper.page_urls or [],
        status=raw_paper.status,
        created_at=raw_paper.created_at,
        original_url=original_url,
        original_urls=original_urls,
        recognized_count=len(question_items),
        questions=question_items,
    )


@router.post("/{raw_paper_id}/recrop", response_model=RawPaperRecropResponse)
def recrop_raw_paper_question(
    raw_paper_id: int,
    payload: RawPaperRecropRequest,
    db: DbSession,
) -> RawPaperRecropResponse:
    raw_paper = raw_paper_service.get_raw_paper(db, raw_paper_id)
    if raw_paper is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Raw paper not found")

    if not raw_paper.page_urls:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Raw paper has no source images")

    if len(payload.box_2d) != 4 or any(v < 0 or v > 1000 for v in payload.box_2d):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="box_2d must be four ints in [0, 1000]")

    if payload.page_index >= len(raw_paper.page_urls):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"page_index out of range, max is {len(raw_paper.page_urls) - 1}",
        )

    storage = MinioService()
    decomposer = ExamPaperDecomposer(storage)
    source_object = raw_paper.page_urls[payload.page_index]

    try:
        original_image_bytes = storage.get_object_bytes(source_object)
    except Exception as exc:
        logger.exception("[CUT] recrop download failed: paper_id=%s source=%s", raw_paper_id, source_object)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to download source image: {exc}") from exc

    try:
        cropped_object = decomposer.crop_single_box(
            original_image_bytes=original_image_bytes,
            box_2d=payload.box_2d,
            crop_prefix=f"paper_{raw_paper_id}_manual_{payload.problem_number}",
        )
    except Exception as exc:
        logger.exception("[CUT] recrop image processing failed: paper_id=%s problem_number=%s", raw_paper_id, payload.problem_number)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to crop image: {exc}") from exc

    question = db.execute(
        select(Question)
        .where(
            Question.raw_paper_id == raw_paper_id,
            Question.problem_number == payload.problem_number,
        )
        .order_by(Question.id.asc())
    ).scalars().first()

    try:
        if question is None:
            question = Question(
                raw_paper_id=raw_paper_id,
                problem_number=payload.problem_number,
                question_type="essay",
                content_latex=f"[manual recrop] problem {payload.problem_number}",
                image_url=cropped_object,
                type_specific_data={
                    "manual_box_2d": payload.box_2d,
                    "manual_page_index": payload.page_index,
                },
                difficulty=0.5,
                status="pending_review",
            )
            db.add(question)
            db.flush()
        else:
            question.image_url = cropped_object
            existing = dict(question.type_specific_data or {})
            existing["manual_box_2d"] = payload.box_2d
            existing["manual_page_index"] = payload.page_index
            question.type_specific_data = existing
            db.add(question)

        db.add(
            QuestionImage(
                question_id=question.id,
                image_url=cropped_object,
                desc="manual_recrop",
            )
        )
        db.commit()
        db.refresh(question)
    except Exception as exc:
        db.rollback()
        logger.exception("[CUT] recrop db update failed: paper_id=%s problem_number=%s", raw_paper_id, payload.problem_number)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to persist recrop result: {exc}") from exc

    image_url = storage.build_object_url(cropped_object)
    return RawPaperRecropResponse(
        paper_id=raw_paper_id,
        question_id=question.id,
        problem_number=payload.problem_number,
        image_url=image_url,
        crop_urls=[image_url],
    )


@router.delete("/{raw_paper_id}/questions/{question_id}")
def delete_raw_paper_question_image(
    raw_paper_id: int,
    question_id: int,
    db: DbSession,
) -> dict[str, object]:
    question = db.execute(
        select(Question)
        .where(
            Question.id == question_id,
            Question.raw_paper_id == raw_paper_id,
        )
    ).scalars().first()
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

    object_paths: set[str] = set()
    if question.image_url:
        object_paths.add(question.image_url)
    if question.images:
        object_paths.update(img.image_url for img in question.images if img.image_url)

    # Best effort cleanup for generated thumbnails: xxx.png -> xxx_thumb.webp
    thumb_candidates: set[str] = set()
    for p in object_paths:
        suffix = Path(p).suffix.lower()
        if suffix == ".png":
            thumb_candidates.add(f"{p[:-4]}_thumb.webp")
    object_paths.update(thumb_candidates)

    db.delete(question)
    db.commit()

    if object_paths:
        try:
            MinioService().delete_files(list(object_paths))
        except Exception:
            logger.exception(
                "[CUT] failed to cleanup deleted question images in MinIO: paper_id=%s question_id=%s",
                raw_paper_id,
                question_id,
            )

    logger.info(
        "[CUT] deleted cropped question image: paper_id=%s question_id=%s removed_objects=%s",
        raw_paper_id,
        question_id,
        len(object_paths),
    )
    return {
        "paper_id": raw_paper_id,
        "question_id": question_id,
        "deleted": True,
    }


@router.get("/{raw_paper_id}/runtime")
def get_raw_paper_runtime(raw_paper_id: int, db: DbSession) -> dict[str, object]:
    raw_paper = raw_paper_service.get_raw_paper(db, raw_paper_id)
    if raw_paper is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Raw paper not found")

    runtime = extraction_runtime.get(raw_paper_id)
    if runtime is None and raw_paper.status == "processing":
        runtime = {
            "paper_id": raw_paper_id,
            "run_id": "pending",
            "status": "processing",
            "stop_requested": False,
            "step": "queued",
            "progress": 1,
            "message": "任务已提交，等待后台处理线程接手",
            "pages_total": len(raw_paper.page_urls or []),
            "pages_processed": 0,
            "questions_detected": 0,
            "images_cropped": 0,
            "llm_page_failures": 0,
            "updated_at": raw_paper.created_at.isoformat() if raw_paper.created_at else "",
            "started_at": raw_paper.created_at.isoformat() if raw_paper.created_at else "",
            "finished_at": None,
        }
    return {
        "paper_id": raw_paper_id,
        "paper_status": raw_paper.status,
        "runtime": runtime,
    }


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


@router.post("/{raw_paper_id}/extract", response_model=RawPaperResponse)
def trigger_raw_paper_extraction(
    raw_paper_id: int,
    background_tasks: BackgroundTasks,
    db: DbSession,
) -> RawPaperResponse:
    raw_paper = raw_paper_service.get_raw_paper(db, raw_paper_id)
    if raw_paper is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Raw paper not found")

    if raw_paper.status == "processing":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Raw paper {raw_paper_id} is already processing",
        )

    previous_status = raw_paper.status
    raw_paper.status = "processing"
    db.commit()
    db.refresh(raw_paper)

    logger.info(
        "[CUT] manual extraction triggered: paper_id=%s previous_status=%s current_status=%s",
        raw_paper.id,
        previous_status,
        "processing",
    )
    background_tasks.add_task(_run_paper_extraction, raw_paper.id)
    return raw_paper


@router.post("/{raw_paper_id}/extract/stop")
def stop_raw_paper_extraction(raw_paper_id: int, db: DbSession) -> dict[str, object]:
    raw_paper = raw_paper_service.get_raw_paper(db, raw_paper_id)
    if raw_paper is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Raw paper not found")

    if raw_paper.status != "processing":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Raw paper {raw_paper_id} is not processing",
        )

    runtime = extraction_runtime.request_stop(raw_paper_id)
    if runtime is None:
        # If runtime state was never initialized, treat as a stuck queued task in dev mode.
        raw_paper.status = "failed"
        db.commit()
        now = datetime.now(timezone.utc).isoformat()
        runtime = {
            "paper_id": raw_paper_id,
            "run_id": "pending",
            "status": "failed",
            "stop_requested": False,
            "step": "stopped",
            "progress": 100,
            "message": "任务未进入执行阶段，已手动停止，可重新发起",
            "pages_total": len(raw_paper.page_urls or []),
            "pages_processed": 0,
            "questions_detected": 0,
            "images_cropped": 0,
            "llm_page_failures": 0,
            "updated_at": now,
            "started_at": now,
            "finished_at": now,
        }
    logger.info("[CUT] manual stop requested: paper_id=%s", raw_paper_id)
    return {
        "paper_id": raw_paper_id,
        "paper_status": raw_paper.status,
        "runtime": runtime,
        "detail": "Stop requested",
    }


@router.post("/upload", response_model=RawPaperResponse, status_code=status.HTTP_201_CREATED)
async def upload_raw_paper(
    title: Annotated[str, Form(...)],
    year: Annotated[int, Form(...)],
    files: Annotated[list[UploadFile], File(...)],
    background_tasks: BackgroundTasks,
    db: DbSession,
    paper_type: Annotated[str | None, Form()] = None,
) -> RawPaperResponse:
    minio_service = MinioService()
    uploaded_paths: list[str] = []
    logger.info(
        "[CUT] upload request received: title=%s year=%s file_count=%s paper_type=%s",
        title,
        year,
        len(files),
        paper_type,
    )

    try:
        for idx, file in enumerate(files, start=1):
            if not file.filename:
                logger.warning("[CUT] skip empty filename during upload: idx=%s", idx)
                continue

            file_content = await file.read()
            content_type = file.content_type or "application/octet-stream"
            logger.info(
                "[CUT] uploading file to MinIO: idx=%s filename=%s content_type=%s bytes=%s",
                idx,
                file.filename,
                content_type,
                len(file_content),
            )

            object_path = minio_service.upload_object(
                file_data=file_content,
                file_name=file.filename,
                content_type=content_type,
            )
            uploaded_paths.append(object_path)
            logger.info(
                "[CUT] uploaded file to MinIO: idx=%s filename=%s object_path=%s",
                idx,
                file.filename,
                object_path,
            )

        payload = RawPaperCreate(
            title=title,
            year=year,
            paper_type=paper_type,
            page_urls=uploaded_paths,
            status="pending",
        )
        raw_paper = raw_paper_service.create_raw_paper(db, payload)
        logger.info(
            "[CUT] raw paper created and queued for extraction: paper_id=%s page_count=%s",
            raw_paper.id,
            len(uploaded_paths),
        )
        background_tasks.add_task(_run_paper_extraction, raw_paper.id)
        return raw_paper
    except Exception as exc:
        logger.exception("[CUT] upload pipeline failed: title=%s year=%s", title, year)
        # Best-effort rollback when any upload step fails.
        if uploaded_paths:
            try:
                minio_service.delete_files(uploaded_paths)
                logger.info(
                    "[CUT] rolled back uploaded files after failure: count=%s",
                    len(uploaded_paths),
                )
            except Exception:
                logger.exception("[CUT] failed to rollback uploaded files")

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to upload raw paper: {exc}",
        ) from exc