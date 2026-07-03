"""Shared helpers for judges."""

from __future__ import annotations

from core.constants import RUBRIC_SCORE_MAX, RUBRIC_SCORE_MIN


def clamp(x: float, lo: float = RUBRIC_SCORE_MIN, hi: float = RUBRIC_SCORE_MAX) -> float:
    return max(lo, min(hi, x))


def linear_falloff(value: float, good: float, bad: float) -> float:
    """Return RUBRIC_SCORE_MAX when value <= good, 0 when value >= bad, linear
    in between.

    If good == bad, returns RUBRIC_SCORE_MAX when value <= good, else 0.
    Both `good` and `bad` are "lower is better" thresholds (latency, cost, etc).
    """
    if bad <= good:
        return RUBRIC_SCORE_MAX if value <= good else RUBRIC_SCORE_MIN
    if value <= good:
        return RUBRIC_SCORE_MAX
    if value >= bad:
        return RUBRIC_SCORE_MIN
    ratio = (value - good) / (bad - good)
    return clamp(RUBRIC_SCORE_MAX * (1.0 - ratio))


def linear_grow(value: float, floor: float, cap: float) -> float:
    """Return 0 at value<=floor, RUBRIC_SCORE_MAX at value>=cap, linear in
    between. Used for "higher is better" (e.g. themes matched)."""
    if cap <= floor:
        return RUBRIC_SCORE_MAX if value >= cap else RUBRIC_SCORE_MIN
    if value <= floor:
        return RUBRIC_SCORE_MIN
    if value >= cap:
        return RUBRIC_SCORE_MAX
    return clamp(RUBRIC_SCORE_MAX * (value - floor) / (cap - floor))
