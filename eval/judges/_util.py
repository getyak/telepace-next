"""Shared helpers for judges."""

from __future__ import annotations


def clamp(x: float, lo: float = 0.0, hi: float = 12.0) -> float:
    return max(lo, min(hi, x))


def linear_falloff(value: float, good: float, bad: float) -> float:
    """Return 12 when value <= good, 0 when value >= bad, linear in between.

    If good == bad, returns 12 when value <= good, else 0.
    Both `good` and `bad` are "lower is better" thresholds (latency, cost, etc).
    """
    if bad <= good:
        return 12.0 if value <= good else 0.0
    if value <= good:
        return 12.0
    if value >= bad:
        return 0.0
    ratio = (value - good) / (bad - good)
    return clamp(12.0 * (1.0 - ratio))


def linear_grow(value: float, floor: float, cap: float) -> float:
    """Return 0 at value<=floor, 12 at value>=cap, linear in between.

    Used for "higher is better" (e.g. themes matched)."""
    if cap <= floor:
        return 12.0 if value >= cap else 0.0
    if value <= floor:
        return 0.0
    if value >= cap:
        return 12.0
    return clamp(12.0 * (value - floor) / (cap - floor))
