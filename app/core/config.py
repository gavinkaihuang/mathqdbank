from functools import lru_cache

from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "MathQBank"
    DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/mathqbank"
    MODEL_TIER_FLASH: str = "gemini-1.5-flash"
    MODEL_TIER_PRO: str = "gemini-1.5-pro"
    GEMINI_API_KEY: str = ""
    LLM_DEBUG_ENABLED: bool = False
    LLM_DEBUG_MAX_TEXT_CHARS: int = 3000
    KEY_RELAY_BASE_URL: str
    KEY_RELAY_TOKEN: str
    PROJECT_NAME: str = "mathqbank"

    # MinIO Configuration (loaded from .env)
    MINIO_ENDPOINT: str
    MINIO_ACCESS_KEY: str
    MINIO_SECRET_KEY: str
    MINIO_BUCKET_NAME: str = "mathqbank"
    MINIO_USE_SSL: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )


@lru_cache
def get_settings() -> Settings:
    try:
        return Settings()
    except ValidationError as exc:
        missing_keys = [
            "/".join(str(part) for part in err.get("loc", []))
            for err in exc.errors()
            if err.get("type") == "missing"
        ]
        if missing_keys:
            keys_text = ", ".join(sorted(set(missing_keys)))
            raise RuntimeError(
                f"Missing required environment variables in .env: {keys_text}"
            ) from exc
        raise RuntimeError(f"Invalid application settings: {exc}") from exc


settings = get_settings()