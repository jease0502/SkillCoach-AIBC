"""Environment settings. Every variable from docs/API_CONTRACT.md lives here."""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    google_genai_use_vertexai: bool = Field(True, alias="GOOGLE_GENAI_USE_VERTEXAI")
    google_cloud_project: str | None = Field("project-6d34f8a9-8150-4e6a-ae7", alias="GOOGLE_CLOUD_PROJECT")
    google_cloud_location: str = Field("global", alias="GOOGLE_CLOUD_LOCATION")
    gemini_api_key: str | None = Field(None, alias="GEMINI_API_KEY")

    gemini_fast_model: str = Field("gemini-3.8-flash", alias="GEMINI_FAST_MODEL")
    gemini_pro_model: str = Field("gemini-3.1-pro-preview", alias="GEMINI_PRO_MODEL")
    # Cheapest/fastest tier for per-turn bookkeeping (state, coach hints).
    gemini_lite_model: str = Field("gemini-3.5-flash-lite", alias="GEMINI_LITE_MODEL")
    gemini_embed_model: str = Field("gemini-embedding-001", alias="GEMINI_EMBED_MODEL")
    # Gemini 3.x models only serve from "global"; the embedding model is regional, so keep it
    # next to Cloud Run (asia-east1: ~170 ms warm vs ~1.1 s cross-Pacific to us-central1).
    gemini_embed_location: str = Field("asia-east1", alias="GEMINI_EMBED_LOCATION")
    embed_dimensions: int = Field(768, alias="EMBED_DIMENSIONS")

    store_backend: str = Field("memory", alias="STORE_BACKEND")
    firestore_database: str | None = Field(None, alias="FIRESTORE_DATABASE")

    cors_origins: str = Field("*", alias="CORS_ORIGINS")

    # Local development / tests: return canned LLM output and hash-based embeddings.
    llm_fake: bool = Field(False, alias="LLM_FAKE")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()] or ["*"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
