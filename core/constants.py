"""Shared domain constants.

Any literal used in more than one place, or any business default that
would surprise a reader if it changed silently, belongs here — not
inlined at each call site.

Runtime-tunable knobs (timeouts, feature flags, provider URLs) belong
in `interfaces.rest_api.config.Settings` instead. This file only holds
values that are properly compile-time defaults.
"""

from __future__ import annotations

# --- Campaign defaults (repeated in models, protocols, and routers)
DEFAULT_TARGET_COMPLETIONS: int = 10
MIN_TARGET_COMPLETIONS: int = 1
MAX_TARGET_COMPLETIONS: int = 1000
DEFAULT_BUDGET_USD: float = 100.0
DEFAULT_OUTLINE_DURATION_MIN: int = 15
DEFAULT_MAX_FOLLOWUPS: int = 2

# --- API surface
API_VERSION_PREFIX: str = "/v1"
RESPONDENT_PATH_PREFIX: str = "/r/"

# --- Voice audio defaults
DEFAULT_SAMPLE_RATE_HZ: int = 16000

# --- Pagination
DEFAULT_LIST_LIMIT: int = 20
EVENT_READ_DEFAULT_LIMIT: int = 500

# --- Time helpers
SECONDS_PER_HOUR: int = 3600

# --- Actor prefixes (used in event `actor` field: "<prefix>:<id>")
ACTOR_USER: str = "user"
ACTOR_SYSTEM: str = "system"
ACTOR_AGENT: str = "agent"
ACTOR_RESPONDENT: str = "respondent"
ACTOR_INTERVIEW: str = "interview"

# --- Event schema version (bump when payload contract breaks)
DEFAULT_EVENT_SCHEMA_VERSION: int = 1

# --- LLM defaults (Protocol-level fallback if caller passes nothing)
DEFAULT_LLM_MAX_TOKENS: int = 1024
DEFAULT_LLM_TEMPERATURE: float = 0.4

# --- Agent history windows / truncation
ANALYST_TURN_HISTORY_LIMIT: int = 40
INTERVIEWER_HISTORY_WINDOW: int = 20
INTERVIEWER_ACTION_TEXT_MAX: int = 500
INSIGHT_TITLE_MAX_CHARS: int = 200
SPEC_UPDATE_REASON_MAX: int = 200
DEFAULT_PERSONA_CONFIDENCE: float = 0.6

# --- Password hashing (PBKDF2-SHA256)
PASSWORD_HASH_ALGORITHM: str = "pbkdf2_sha256"
PASSWORD_SALT_BYTES: int = 16
PASSWORD_HASH_BYTES: int = 32

# --- Auth / JWT
JWT_TOKEN_TYPE: str = "bearer"
JWT_TYP_ACCESS: str = "access"
JWT_TYP_REFRESH: str = "refresh"
HTTP_AUTH_SCHEME: str = "bearer"

# --- Auth field length caps
EMAIL_MIN_LEN: int = 3
EMAIL_MAX_LEN: int = 254
DISPLAY_NAME_MAX: int = 256
PASSWORD_MAX_LEN: int = 256

# --- Dispatch address hashing (do not shorten below 12 → collision-prone)
PII_HASH_HEX_LEN: int = 16

# --- Storage layer
EVENT_TAIL_QUEUE_MAX: int = 1024
PG_NOTIFY_CHANNEL: str = "events_channel"
BRAND_SIGNATURE: str = "The telepace team"

# --- HTTP defaults
HTTP_ERROR_MSG_MAX: int = 200
SSE_HEADERS: dict[str, str] = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
    "Connection": "keep-alive",
}

# --- Mock TTS / STT
MOCK_TTS_SILENCE_FRAMES: int = 20
MOCK_STT_INTERVAL_S: float = 3.0
MOCK_STT_TEXT: str = "hello"

# --- Voice VAD (Silero fallback tuning)
VAD_FRAME_MS: int = 30
VAD_WINDOW_MS: int = 300
VAD_SILENCE_HANGOVER_MS: int = 500
VAD_SILENCE_THRESHOLD: float = 500.0

# --- Voice audio queue backpressure (WS server side)
VOICE_AUDIO_QUEUE_MAX: int = 256


# --- Voice WS message types (shared with the frontend `voice-protocol`)
class VoiceWSMessage:
    HELLO: str = "hello"
    ERROR: str = "error"
    REPLY: str = "reply"
    INTERVIEWER_TURN: str = "interviewer_turn"
    STT_DELTA: str = "stt_delta"
    TTS_START: str = "tts_start"
    TTS_END: str = "tts_end"


# --- Dispatch mock log filenames
DISPATCH_LOG_FILENAMES: dict[str, str] = {
    "email": "email.jsonl",
    "sms": "sms.jsonl",
    "phone": "phone_outbound.jsonl",
}

# --- Rubric scoring (12-dim rubric, shared by judges)
RUBRIC_SCORE_MIN: float = 0.0
RUBRIC_SCORE_MAX: float = 12.0
RUBRIC_CHANNELS: tuple[str, ...] = (
    "link",
    "email",
    "sms",
    "outbound-call",
    "inbound-hotline",
)
GROUNDEDNESS_MIN_KEYWORD_LEN: int = 4
JUDGE_MAX_TOKENS: int = 256
JUDGE_TEMPERATURE: float = 0.0
JUDGE_FALLBACK_TEMPERATURE: float = 0.3
JUDGE_RETRY_ATTEMPTS: int = 3
JUDGE_RETRY_BASE_DELAY_S: float = 0.5

# --- Rubric per-dimension thresholds
DIM01_GOOD_S: float = 20.0
DIM01_BAD_S: float = 120.0
DIM02_GOOD_S: float = 2.0
DIM02_BAD_S: float = 10.0
DIM03_GOOD_MS: float = 800.0
DIM03_BAD_MS: float = 2500.0
DIM05_PER_CHANNEL_WEIGHT: float = 2.4
DIM09_GOOD_USD: float = 1.5
DIM09_BAD_USD: float = 6.0
DIM10_GOOD_HOURS: float = 1.0
DIM10_BAD_HOURS: float = 24.0
DIM11_EVENT_SAMPLE: int = 50

# Dim 12: n_shots thresholds and per-tier scores
DIM12_SHOTS_TIER_HIGH: int = 20
DIM12_SHOTS_TIER_MID: int = 10
DIM12_SHOTS_TIER_LOW: int = 5
DIM12_SCORE_HIGH: float = 12.0
DIM12_SCORE_MID: float = 9.0
DIM12_SCORE_LOW: float = 6.0
DIM12_SCORE_MIN_NONZERO: float = 3.0

# --- Scoreboard CI thresholds
SCOREBOARD_CONCURRENCY: int = 8
SCOREBOARD_REGRESSION_THRESHOLD: float = 1.0
SCOREBOARD_FAIL_UNDER: float = 10.5

# --- Escalation keyword lists (EN + zh-CN)
ESCALATION_HIGH_KEYWORDS: tuple[str, ...] = (
    "lawsuit",
    "complain",
    "refund",
    "angry",
    "hate",
    "scam",
    "report you",
    "抱怨",
    "投诉",
    "退款",
    "气死",
    "骗子",
)
ESCALATION_MEDIUM_KEYWORDS: tuple[str, ...] = (
    "disappointed",
    "frustrated",
    "confused",
    "不满意",
    "失望",
    "困惑",
)

# --- PII redaction tokens
REDACTION_TOKEN_EMAIL: str = "[email]"
REDACTION_TOKEN_PHONE: str = "[phone]"
REDACTION_TOKEN_ID: str = "[id]"

# --- Product / brand
PRODUCT_NAME: str = "telepace"

# --- Dispatch invite copy (English default; move to per-locale templates
# under `agents/*/prompts/` when i18n is added).
DISPATCH_EMAIL_SUBJECT_TPL: str = "You're invited: {spec_title}"
DISPATCH_EMAIL_GREETING_NAMED_TPL: str = "Hi {name},"
DISPATCH_EMAIL_GREETING_ANON: str = "Hi there,"
DISPATCH_EMAIL_INTRO_FALLBACK_TPL: str = "We're running a short study: {spec_goal}"
DISPATCH_EMAIL_BODY_TEXT_TPL: str = (
    "{greeting}\n\n"
    "{intro}\n\n"
    "It takes ~{duration_min} minutes. Start here: {share_url}\n\n"
    "Thanks,\n{brand_signature}"
)
DISPATCH_EMAIL_BODY_HTML_TPL: str = (
    "<p>{greeting}</p>"
    "<p>{intro}</p>"
    '<p>It takes ~{duration_min} minutes. <a href="{share_url}">Start the interview</a>.</p>'
    "<p>Thanks,<br/>{brand_signature}</p>"
)
DISPATCH_SMS_INTRO_FALLBACK_TPL: str = "Quick research on {spec_title}"
DISPATCH_SMS_BODY_TPL: str = "{intro} Join in ~{duration_min} min: {share_url}"
DISPATCH_PHONE_OPENING_TPL: str = (
    "Hi{name_suffix}, this is {brand} calling about {spec_title}. "
    "Do you have a few minutes?"
)
DISPATCH_SPEC_TITLE_FALLBACK: str = "our study"
DISPATCH_SPEC_GOAL_FALLBACK: str = "understand your experience"
