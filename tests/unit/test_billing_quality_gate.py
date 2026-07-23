"""Quality gate (T-613 minimal rule): what counts as a qualified interview."""

from __future__ import annotations

from core.billing import QualityGateConfig, evaluate_quality

CONFIG = QualityGateConfig(min_duration_seconds=60, min_goal_coverage=0.3)


def test_qualified_when_both_thresholds_met() -> None:
    verdict = evaluate_quality(duration_seconds=120, goal_coverage=0.8, config=CONFIG)
    assert verdict.qualified
    assert verdict.reasons == ()


def test_disqualified_on_short_duration() -> None:
    verdict = evaluate_quality(duration_seconds=30, goal_coverage=0.9, config=CONFIG)
    assert not verdict.qualified
    assert "duration_below_minimum" in verdict.reasons


def test_disqualified_on_low_coverage() -> None:
    verdict = evaluate_quality(duration_seconds=300, goal_coverage=0.1, config=CONFIG)
    assert not verdict.qualified
    assert "goal_coverage_below_minimum" in verdict.reasons


def test_both_reasons_reported() -> None:
    verdict = evaluate_quality(duration_seconds=10, goal_coverage=0.0, config=CONFIG)
    assert verdict.reasons == (
        "duration_below_minimum",
        "goal_coverage_below_minimum",
    )


def test_exact_thresholds_qualify() -> None:
    verdict = evaluate_quality(duration_seconds=60, goal_coverage=0.3, config=CONFIG)
    assert verdict.qualified
