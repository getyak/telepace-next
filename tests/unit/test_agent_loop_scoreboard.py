from __future__ import annotations

import json
from pathlib import Path

import pytest

from eval.agent_loop.scoreboard import load_checks, validate_and_score


def test_repository_capability_evidence_is_complete() -> None:
    root = Path(__file__).resolve().parents[2]
    checks = load_checks(root / "eval/datasets/agent_loop/capability-audit.json")
    evidence_dir = root / "eval/results/agent_loop/capability"

    totals = {}
    for agent in ("telepace", "manus", "codex_cloud"):
        path = evidence_dir / f"{agent}.json"
        evidence = json.loads(path.read_text())
        totals[agent], _ = validate_and_score(checks, evidence, path)

    assert set(totals) == {"telepace", "manus", "codex_cloud"}
    assert all(0.0 <= total <= 100.0 for total in totals.values())


def test_positive_score_requires_evidence_reference(tmp_path: Path) -> None:
    rubric = tmp_path / "rubric.json"
    rubric.write_text(
        json.dumps(
            {
                "checks": [
                    {
                        "id": "only",
                        "dimension": "test",
                        "weight": 100,
                        "description": "one check",
                    }
                ]
            }
        )
    )
    checks = load_checks(rubric)

    with pytest.raises(ValueError, match="requires at least one evidence ref"):
        validate_and_score(
            checks,
            {"checks": {"only": {"value": 1, "refs": []}}},
            tmp_path / "evidence.json",
        )
