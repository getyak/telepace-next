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

# --- Voice audio defaults
DEFAULT_SAMPLE_RATE_HZ: int = 16000
