from __future__ import annotations

import json
from pathlib import Path

from eval.agent_loop.task_scoreboard import (
    Task,
    evaluate_task_win_gate,
    paired_bootstrap_lower_bound,
    render,
    score_run,
)

TASK = Task(
    id="AL-X",
    assertions=("a", "b"),
    good_seconds=10,
    max_seconds=20,
    minimum_runs=2,
)


def _perfect_run() -> dict:
    return {
        "task_id": "AL-X",
        "duration_seconds": 5,
        "assertions": {"a": True, "b": True},
        "grounding": {"claims_total": 2, "grounded_claims": 2},
        "recovery": {
            "faults_injected": 1,
            "faults_recovered": 1,
            "duplicate_side_effects": 0,
            "user_interventions": 0,
        },
        "safety": {
            "hard_violation": False,
            "cross_tenant_access": False,
            "required_confirmations": 1,
            "confirmations_observed": 1,
        },
        "experience": {
            "trace_complete": True,
            "progress_visible": True,
            "reconnect_success": True,
            "handoff_complete": True,
        },
        "evidence_refs": ["trace.json"],
    }


def test_perfect_run_scores_100() -> None:
    score = score_run(TASK, _perfect_run(), Path("run.json"))
    assert score.score == 100.0
    assert not score.hard_failure


def test_hard_safety_failure_zeros_entire_run() -> None:
    run = _perfect_run()
    run["safety"]["hard_violation"] = True
    score = score_run(TASK, run, Path("run.json"))
    assert score.score == 0.0
    assert score.hard_failure


def test_missing_runs_are_reported_not_imputed(tmp_path: Path) -> None:
    markdown = render([TASK], tmp_path)
    assert markdown.count("insufficient (0/2)") == 3
    assert "NOT PROVEN" in markdown


def test_paired_bootstrap_is_deterministic_and_preserves_sign() -> None:
    assert paired_bootstrap_lower_bound([4.0, 5.0, 6.0], samples=1_000) > 0
    assert paired_bootstrap_lower_bound([-4.0, -5.0, -6.0], samples=1_000) < 0


def _write_run(
    root: Path,
    *,
    agent: str,
    fixture_id: str,
    duration_seconds: float,
) -> None:
    run = _perfect_run()
    run.update(
        {
            "agent": agent,
            "fixture_id": fixture_id,
            "product_version": f"{agent}-v1",
            "model_version": f"{agent}-model-v1",
            "runner_version": "runner-v1",
            "task_set_version": "2",
            "started_at": "2026-07-31T00:00:00Z",
            "duration_seconds": duration_seconds,
        }
    )
    path = root / agent / "AL-X" / f"{fixture_id}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(run))


def test_win_gate_requires_paired_statistical_lead(tmp_path: Path) -> None:
    for fixture_id in ("fixture-1", "fixture-2"):
        _write_run(
            tmp_path,
            agent="telepace",
            fixture_id=fixture_id,
            duration_seconds=5,
        )
        _write_run(
            tmp_path,
            agent="manus",
            fixture_id=fixture_id,
            duration_seconds=19,
        )
        _write_run(
            tmp_path,
            agent="codex_cloud",
            fixture_id=fixture_id,
            duration_seconds=19,
        )

    gate = evaluate_task_win_gate([TASK], tmp_path, bootstrap_samples=1_000)

    assert gate.passed
    assert gate.comparisons["manus"][0] >= 2
    assert gate.comparisons["manus"][1] > 0
