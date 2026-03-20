from app.api.routers.questions import router as questions_router
from app.api.routers.raw_papers import router as raw_papers_router
from app.api.routers.tags import router as tags_router

__all__ = ["raw_papers_router", "questions_router", "tags_router"]