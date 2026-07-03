"""Centralized user-facing error messages.

All HTTPException `detail` strings should live here so we have a single
place to review copy, and later swap in i18n without touching routers.
"""

from __future__ import annotations


class ErrorMessages:
    # Auth
    AUTHENTICATION_REQUIRED = "authentication required"
    INVALID_CREDENTIALS = "invalid email or password"
    EMAIL_ALREADY_REGISTERED = "email already registered"
    ACCOUNT_LOCKED = "account is temporarily locked"
    PASSWORD_TOO_SHORT = "password must be at least {min_length} characters"
    USER_NOT_FOUND = "user not found"
    AUTH_UNAVAILABLE = "auth subsystem not initialized"

    # Campaigns
    CAMPAIGN_NOT_FOUND = "campaign not found"
    DESIGNER_AGENT_MISSING = "designer agent not registered"

    # Voice / WebSocket
    VOICE_EMPTY_REPLY = "empty_reply"
    VOICE_STT_FAILED = "stt_failed:{exc}"
    VOICE_TTS_FAILED = "tts_failed:{exc}"

    # Dispatch
    NO_EMAIL_DISPATCHER = "no email dispatcher configured"
    NO_SMS_DISPATCHER = "no sms dispatcher configured"
    NO_PHONE_DISPATCHER = "no phone dispatcher configured"
