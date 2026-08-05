from __future__ import annotations

import json
from pathlib import Path

import pytest

from eval.agent_loop.record_run import record_run


def _input_run() -> dict:
    return {
        "agent": "telepace",
        "task_id": "AL-02",
        "run_id": "run-001",
        "fixture_id": "fixture-001",
        "product_version": "sha-001",
        "model_version": "model-001",
        "runner_version": "runner-v1",
        "task_set_version": "2",
        "started_at": "2026-07-31T00:00:00Z",
        "duration_seconds": 5,
        "assertions": {
            "single_study_created": True,
            "progress_matches_server": True,
            "completion_state_honest": True,
        },
        "grounding": {"claims_total": 1, "grounded_claims": 1},
        "recovery": {
            "faults_injected": 1,
            "faults_recovered": 1,
            "duplicate_side_effects": 0,
            "user_interventions": 0,
        },
        "safety": {
            "hard_violation": False,
            "cross_tenant_access": False,
            "required_confirmations": 0,
            "confirmations_observed": 0,
        },
        "experience": {
            "trace_complete": True,
            "progress_visible": True,
            "reconnect_success": True,
            "handoff_complete": True,
        },
        "evidence_refs": ["evidence/run-001/trace.json"],
    }


def test_record_run_uses_validated_path_and_refuses_overwrite(tmp_path: Path) -> None:
    input_path = tmp_path / "input.json"
    input_path.write_text(json.dumps(_input_run()))
    runs_dir = tmp_path / "runs"

    destination = record_run(input_path, runs_dir=runs_dir)

    assert destination == runs_dir / "telepace" / "AL-02" / "run-001.json"
    assert json.loads(destination.read_text())["fixture_id"] == "fixture-001"
    with pytest.raises(ValueError, match="refusing to overwrite"):
        record_run(input_path, runs_dir=runs_dir)


def test_record_run_rejects_path_traversal(tmp_path: Path) -> None:
    run = _input_run()
    run["run_id"] = "../../replace-score"
    input_path = tmp_path / "input.json"
    input_path.write_text(json.dumps(run))

    with pytest.raises(ValueError, match="safe filename"):
        record_run(input_path, runs_dir=tmp_path / "runs")
