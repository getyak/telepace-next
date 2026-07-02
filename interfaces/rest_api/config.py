"""Runtime settings loaded from environment / .env file."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TELEPACE_", env_file=".env", extra="ignore")

    database_url: str = "postgresql://telepace:telepace@localhost:5432/telepace"
    redis_url: str = "redis://localhost:6379/0"
    public_base_url: str = "http://localhost:3000"
    api_base_url: str = "http://localhost:8000"

    default_org_id: str = "00000000-0000-0000-0000-000000000001"
    default_author_id: str = "00000000-0000-0000-0000-000000000002"

    # LLM provider selection: "openrouter" | "anthropic" | "mock"
    llm_provider: str = "mock"

    # Anthropic (used when llm_provider == "anthropic")
    anthropic_api_key: str | None = None

    # OpenRouter / OpenAI-compatible (used when llm_provider == "openrouter")
    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    llm_model_heavy: str = "deepseek/deepseek-v4-pro"
    llm_model_general: str = "z-ai/glm-4.7"
    llm_model_fast: str = "deepseek/deepseek-v4-flash"

    langfuse_secret_key: str | None = None
    langfuse_public_key: str | None = None

    voice_service_url: str = "http://localhost:9099"
    s3_bucket: str | None = None
    s3_endpoint: str | None = None

    # Dispatch channel provider selection
    email_provider: str = "mock"  # "resend" | "mock"
    sms_provider: str = "mock"  # "twilio" | "mock"
    phone_provider: str = "mock"  # "vapi" | "mock"

    # Resend (email)
    resend_api_key: str | None = None
    email_from: str = "telepace <invites@telepace.local>"

    # Twilio (sms)
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_from: str | None = None

    # Vapi (outbound phone)
    vapi_api_key: str | None = None
    vapi_assistant_id: str | None = None
    vapi_phone_number_id: str | None = None

    # --- Voice pipeline (Phase 3): STT + TTS providers.
    # Provider selection: "deepgram" | "mock" and "elevenlabs" | "mock".
    voice_stt_provider: str = "mock"
    voice_tts_provider: str = "mock"
    deepgram_api_key: str | None = None
    elevenlabs_api_key: str | None = None
    elevenlabs_voice_id: str = "EXAVITQu4vr4xnSDxMaL"


@lru_cache
def get_settings() -> Settings:
    return Settings()
