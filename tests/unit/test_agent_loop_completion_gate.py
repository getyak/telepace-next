from __future__ import annotations

from eval.agent_loop.completion_gate import CapabilityGate, render
from eval.agent_loop.task_scoreboard import WinGate


def test_completion_gate_never_conflates_capability_with_task_victory() -> None:
    report = render(
        CapabilityGate(
            passed=True,
            total=96,
            dimensions={"Durability": 15, "Safety": 10},
            reasons=(),
        ),
        WinGate(
            passed=False,
            reasons=("manus/AL-01: requires 5 runs, found 0",),
            comparisons={},
        ),
    )

    assert "Overall: **NOT PROVEN**" in report
    assert "Capability floor" in report
    assert "Status: **PASS**" in report
    assert "Missing runs are never imputed" in report
