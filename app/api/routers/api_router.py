from fastapi import APIRouter

from app.api.routers.questions import router as questions_router
from app.api.routers.raw_papers import router as raw_papers_router
from app.api.routers.tags import router as tags_router
from app.api.routers.upload import router as upload_router
from app.api.routers.prompts import router as prompts_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(raw_papers_router)
api_router.include_router(questions_router)
api_router.include_router(tags_router)
api_router.include_router(upload_router)
api_router.include_router(prompts_router)
