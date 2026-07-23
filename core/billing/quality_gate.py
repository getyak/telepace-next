"""Minimal interview quality gate (T-613, pending the full T-601 definition).

An interview only counts against quota / billing when it is *qualified*:
completed, long enough to plausibly be a real conversation, and covering a
minimum share of the study's key questions. Thresholds come from Settings so
the rule can tighten once T-601 lands without touching this module's callers.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class QualityGateConfig:
    min_duration_seconds: int = 60
    min_goal_coverage: float = 0.3


@dataclass(frozen=True, slots=True)
class QualityVerdict:
    qualified: bool
    # Machine-readable reasons for a fail — empty when qualified.
    reasons: tuple[str, ...] = ()


def evaluate_quality(
    *,
    duration_seconds: int,
    goal_coverage: float,
    config: QualityGateConfig,
) -> QualityVerdict:
    """Judge one completed interview against the minimal gate.

    Callers only invoke this for COMPLETED interviews — abandonment is
    filtered upstream by event type, so completion is not re-checked here.
    """
    reasons: list[str] = []
    if duration_seconds < config.min_duration_seconds:
        reasons.append("duration_below_minimum")
    if goal_coverage < config.min_goal_coverage:
        reasons.append("goal_coverage_below_minimum")
    return QualityVerdict(qualified=not reasons, reasons=tuple(reasons))
