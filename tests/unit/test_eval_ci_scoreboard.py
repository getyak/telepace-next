from __future__ import annotations

from eval.ci import scoreboard
from eval.judges.types import Score


def test_judge_crash_fails_even_when_scenario_median_passes(
    monkeypatch,
) -> None:
    monkeypatch.setattr(scoreboard, "_git_head_meta", lambda: ("abc1234", "test"))
    scores = {
        "S1": [
            Score(
                dim=dim,
                scenario_id="S1",
                score=0.0 if dim == 4 else 12.0,
                rationale=(
                    "judge crashed: NameError: missing dependency"
                    if dim == 4
                    else "deterministic evidence passed"
                ),
                evidence_pointer="eval/results/S1.json",
            )
            for dim, _ in scoreboard.DIM_MODULES
        ]
    }

    markdown, failures = scoreboard.render_markdown(
        scores,
        prior={},
        fail_under=10.5,
    )

    assert "| S1 |" in markdown
    assert any(failure.startswith("judge failure: S1 D4:") for failure in failures)
    assert not any("median under fail-under" in failure for failure in failures)
