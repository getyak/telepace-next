"""Runtime settings loaded from environment / .env file.

Single source of truth for every environment-dependent value in the backend.
All fields are prefixed with `TELEPACE_` in the environment; hardcoded default
ports/URLs match `deploy/docker-compose.dev.yml` and `.env.example`.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TELEPACE_", env_file=".env", extra="ignore")

    # --- Core infrastructure (defaults match docker-compose.dev.yml exposed ports)
    database_url: str = "postgresql://telepace:telepace@localhost:15432/telepace"
    redis_url: str = "redis://localhost:16379/0"

    # --- HTTP server
    api_host: str = "0.0.0.0"
    api_port: int = 8010
    api_version_prefix: str = "/v1"

    # --- Public-facing URLs
    public_base_url: str = "http://localhost:3000"
    api_base_url: str = "http://localhost:8010"

    # --- CORS (comma-separated in env, list at runtime)
    cors_allow_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://localhost:3002",
        ]
    )

    # --- Postgres pool
    pg_pool_min_size: int = 1
    pg_pool_max_size: int = 10

    # --- Dev-only default identity (only used when auth is disabled)
    default_org_id: str = "00000000-0000-0000-0000-000000000001"
    default_author_id: str = "00000000-0000-0000-0000-000000000002"

    # --- Auth (JWT)
    auth_enabled: bool = True
    jwt_secret: str = "dev-insecure-jwt-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_seconds: int = 60 * 60  # 1h
    jwt_refresh_ttl_seconds: int = 60 * 60 * 24 * 14  # 14d
    jwt_issuer: str = "telepace"
    jwt_audience: str = "telepace-api"

    # --- Password policy
    password_min_length: int = 8
    password_hash_rounds: int = 12  # bcrypt cost
    auth_max_failed_attempts: int = 5
    auth_lockout_seconds: int = 15 * 60

    # --- Actor prefixes
    actor_prefix_user: str = "user"
    actor_prefix_system: str = "system"

    # --- LLM provider selection: "openrouter" | "anthropic" | "mock"
    llm_provider: str = "mock"

    # Anthropic
    anthropic_api_key: str | None = None
    anthropic_default_model: str = "claude-sonnet-4-6"

    # OpenRouter / OpenAI-compatible
    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    llm_model_heavy: str = "deepseek/deepseek-v4-pro"
    llm_model_general: str = "z-ai/glm-4.7"
    llm_model_fast: str = "deepseek/deepseek-v4-flash"

    # Langfuse observability
    langfuse_secret_key: str | None = None
    langfuse_public_key: str | None = None

    # --- Voice pipeline
    voice_service_url: str = "http://localhost:9099"
    voice_stt_provider: str = "mock"
    voice_tts_provider: str = "mock"

    # Deepgram STT
    deepgram_api_key: str | None = None
    deepgram_ws_url: str = "wss://api.deepgram.com/v1/listen"
    deepgram_model: str = "nova-3"
    deepgram_language: str = "en-US"
    deepgram_sample_rate_hz: int = 16000
    deepgram_ping_interval_s: int = 5
    deepgram_ping_timeout_s: int = 20

    # ElevenLabs TTS
    elevenlabs_api_key: str | None = None
    elevenlabs_base_url: str = "https://api.elevenlabs.io/v1"
    elevenlabs_voice_id: str = "EXAVITQu4vr4xnSDxMaL"
    elevenlabs_model_id: str = "eleven_turbo_v2_5"
    elevenlabs_output_format: str = "mp3_44100_128"
    elevenlabs_stability: float = 0.5
    elevenlabs_similarity_boost: float = 0.75
    elevenlabs_timeout_s: float = 20.0
    elevenlabs_connect_timeout_s: float = 5.0
    elevenlabs_stream_chunk_bytes: int = 4096

    # --- Object storage
    s3_bucket: str | None = None
    s3_endpoint: str | None = None

    # --- Dispatch channel provider selection
    email_provider: str = "mock"  # "resend" | "mock"
    sms_provider: str = "mock"  # "twilio" | "mock"
    phone_provider: str = "mock"  # "vapi" | "mock"

    # Dispatch tuning
    dispatch_log_dir: str = "data/dispatched"
    channel_http_timeout_s: float = 10.0
    dispatch_retry_attempts: int = 3
    dispatch_retry_base_delay_s: float = 0.25

    # Resend
    resend_api_key: str | None = None
    resend_base_url: str = "https://api.resend.com"
    email_from: str = "telepace <invites@telepace.local>"

    # Twilio
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_from: str | None = None
    twilio_base_url: str = "https://api.twilio.com/2010-04-01"

    # Vapi
    vapi_api_key: str | None = None
    vapi_assistant_id: str | None = None
    vapi_phone_number_id: str | None = None
    vapi_base_url: str = "https://api.vapi.ai"
    vapi_call_timeout_s: float = 15.0

    # --- Harness / policy
    memory_ttl_seconds: int = 60 * 60
    budget_warn_ratio: float = 0.8
    budget_hard_stop_ratio: float = 1.0
    event_store_maintenance_interval_s: int = 60 * 60

    # --- Agent LLM tuning (max_tokens / temperature per agent)
    designer_max_tokens: int = 1500
    designer_temperature: float = 0.3
    interviewer_max_tokens: int = 800
    interviewer_temperature: float = 0.5
    analyst_max_tokens: int = 3000
    analyst_temperature: float = 0.3

    @field_validator("cors_allow_origins", mode="before")
    @classmethod
    def _split_cors(cls, v: object) -> object:
        if isinstance(v, str):
            return [item.strip() for item in v.split(",") if item.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
