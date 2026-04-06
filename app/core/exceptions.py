from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


# ---------------------------------------------------------------------------
# Custom exception classes
# ---------------------------------------------------------------------------


class AppError(Exception):
    """Base class for all application-level errors."""

    def __init__(self, message: str, code: str, http_status: int) -> None:
        self.message = message
        self.code = code
        self.http_status = http_status
        super().__init__(message)


class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found") -> None:
        super().__init__(message=message, code="NOT_FOUND", http_status=status.HTTP_404_NOT_FOUND)


class BadRequestError(AppError):
    def __init__(self, message: str = "Bad request") -> None:
        super().__init__(message=message, code="BAD_REQUEST", http_status=status.HTTP_400_BAD_REQUEST)


class ConflictError(AppError):
    def __init__(self, message: str = "Conflict") -> None:
        super().__init__(message=message, code="CONFLICT", http_status=status.HTTP_409_CONFLICT)


class KeyRelayException(AppError):
    def __init__(
        self,
        code: str | None = "KEY_RELAY_ERROR",
        message: str = "Key relay request failed",
        http_status: int = status.HTTP_502_BAD_GATEWAY,
    ) -> None:
        super().__init__(
            message=message,
            code=code or "KEY_RELAY_ERROR",
            http_status=http_status,
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_HTTP_CODE_MAP: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    422: "UNPROCESSABLE_ENTITY",
    500: "INTERNAL_SERVER_ERROR",
}


def _error_body(code: str, message: str) -> dict[str, str]:
    return {"code": code, "message": message}


# ---------------------------------------------------------------------------
# Exception handlers (to be registered with the FastAPI app)
# ---------------------------------------------------------------------------


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.http_status,
        content=_error_body(exc.code, exc.message),
    )


async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    code = _HTTP_CODE_MAP.get(exc.status_code, "HTTP_ERROR")
    message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_body(code, message),
    )


async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    message = "; ".join(
        f"{' -> '.join(str(loc) for loc in e['loc'])}: {e['msg']}"
        for e in exc.errors()
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=_error_body("VALIDATION_ERROR", message),
    )
