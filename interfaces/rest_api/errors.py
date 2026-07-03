"""Centralized user-facing error messages.

All HTTPException `detail` strings should live here so we have a single
place to review copy, and later swap in i18n without touching routers.
"""

from __future__ import annotations


class ErrorMessages:
    # Auth
    INVALID_CREDENTIALS = "invalid email or password"
    EMAIL_ALREADY_REGISTERED = "email already registered"
    ACCOUNT_LOCKED = "account is temporarily locked"
    PASSWORD_TOO_SHORT = "password must be at least {min_length} characters"
    USER_NOT_FOUND = "user not found"
    AUTH_UNAVAILABLE = "auth subsystem not initialized"

    # Campaigns
    CAMPAIGN_NOT_FOUND = "campaign not found"
    DESIGNER_AGENT_MISSING = "designer agent not registered"
