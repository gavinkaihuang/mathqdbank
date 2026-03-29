from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "MathQBank"
    DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/mathqbank"
    MODEL_TIER_FLASH: str = "gemini-1.5-flash"
    MODEL_TIER_PRO: str = "gemini-1.5-pro"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()