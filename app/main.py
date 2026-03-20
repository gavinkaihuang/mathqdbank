from fastapi import FastAPI

from app.api.routers import questions_router, raw_papers_router, tags_router
from app.core.config import settings


app = FastAPI(title=settings.APP_NAME)

app.include_router(raw_papers_router)
app.include_router(questions_router)
app.include_router(tags_router)


@app.get("/ping")
def ping() -> dict[str, str]:
    return {"status": "ok", "service": settings.APP_NAME}