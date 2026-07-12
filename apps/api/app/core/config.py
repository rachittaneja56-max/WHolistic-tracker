from __future__ import annotations

from typing import Annotated, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Personal Dev KG API"
    app_env: str = "development"
    app_admin_password_hash: str | None = None
    app_session_secret: str | None = None
    frontend_origin: str = "http://localhost:5173"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5433/personal_dev_kg"
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    embedding_backend: Literal["auto", "sentence_transformer", "hash"] = "auto"
    embedding_model_name: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_dimension: int = 384
    embedding_text_max_chars: int = 8000
    ai_enabled: bool = False
    openai_api_key: str | None = None
    openai_model_fast: str = "gpt-4.1-mini"
    openai_model_smart: str = "gpt-4.1"
    github_integration_enabled: bool = False
    github_webhook_secret: str | None = None
    github_access_token: str | None = None
    web_search_enabled: bool = False
    web_search_provider: Literal["tavily"] = "tavily"
    tavily_api_key: str | None = None
    leetcode_session_cookie: str | None = None
    leetcode_csrf_token: str | None = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


settings = Settings()
