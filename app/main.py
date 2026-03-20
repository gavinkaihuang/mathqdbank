from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routers.api_router import api_router
from app.core.config import settings
from app.core.exceptions import (
    AppError,
    app_error_handler,
    http_exception_handler,
    validation_error_handler,
)

app = FastAPI(title=settings.APP_NAME)

# ---- routers ----
app.include_router(api_router)

# ---- exception handlers ----
app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]


@app.get("/ping")
def ping() -> dict[str, str]:
    return {"status": "ok", "service": settings.APP_NAME}