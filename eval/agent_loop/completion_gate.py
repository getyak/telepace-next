"""Evaluate the complete, non-negotiable Agent Loop win condition.

This combines the capability floor with the paired black-box task gate. It
generates a report even when evidence is incomplete; pass ``--require-pass`` in
CI when a release is expected to satisfy every condition.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from eval.agent_loop.scoreboard import (
    DEFAULT_EVIDENCE_DIR,
    DEFAULT_RUBRIC,
    load_checks,
    validate_and_score,
)
from eval.agent_loop.task_scoreboard import (
    DEFAULT_RUNS,
    DEFAULT_TASKS,
    WinGate,
    evaluate_task_win_gate,
    load_tasks,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "docs" / "agent-loop-completion-gate.md"


@dataclass(frozen=True, slots=True)
class CapabilityGate:
    passed: bool
    total: float
    dimensions: dict[str, float]
    reasons: tuple[str, ...]


def _read_object(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected JSON object")
    return value


def evaluate_capability_gate(
    rubric_path: Path,
    evidence_dir: Path,
) -> CapabilityGate:
    checks = load_checks(rubric_path)
    evidence_path = evidence_dir / "telepace.json"
    total, dimensions = validate_and_score(
        checks,
        _read_object(evidence_path),
        evidence_path,
    )
    reasons = []
    if total < 90:
        reasons.append(f"Telepace capability total {total:.1f} is below 90.0")
    if dimensions.get("Durability", 0) < 13:
        reasons.append(
            f"Telepace Durability {dimensions.get('Durability', 0):.1f} is below 13.0"
        )
    if dimensions.get("Safety", 0) < 9:
        reasons.append(f"Telepace Safety {dimensions.get('Safety', 0):.1f} is below 9.0")
    return CapabilityGate(
        passed=not reasons,
        total=total,
        dimensions=dimensions,
        reasons=tuple(reasons),
    )


def render(capability: CapabilityGate, tasks: WinGate) -> str:
    passed = capability.passed and tasks.passed
    lines = [
        "# Agent Loop Completion Gate",
        "",
        f"- Generated: {datetime.now(UTC).isoformat(timespec='seconds')}",
        f"- Overall: **{'PASS' if passed else 'NOT PROVEN'}**",
        "",
        "## Capability floor",
        "",
        f"- Status: **{'PASS' if capability.passed else 'FAIL'}**",
        f"- Telepace total: {capability.total:.1f} / 100 (required ≥ 90)",
        (
            f"- Durability: {capability.dimensions.get('Durability', 0):.1f} / 15 "
            "(required ≥ 13)"
        ),
        (
            f"- Safety: {capability.dimensions.get('Safety', 0):.1f} / 10 "
            "(required ≥ 9)"
        ),
        "",
        "## Paired black-box task gate",
        "",
        f"- Status: **{'PASS' if tasks.passed else 'NOT PROVEN'}**",
    ]
    lines.extend(f"- {reason}" for reason in tasks.reasons)
    for competitor, (lead, lower) in tasks.comparisons.items():
        lines.append(
            f"- Telepace vs {competitor}: macro lead {lead:.2f}; "
            f"paired bootstrap 95% lower bound {lower:.2f}"
        )
    lines.extend(
        [
            "",
            "The project may claim that Telepace exceeds both competitors only when "
            "the overall status above is PASS. Missing runs are never imputed.",
            "",
        ]
    )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rubric", type=Path, default=DEFAULT_RUBRIC)
    parser.add_argument("--evidence-dir", type=Path, default=DEFAULT_EVIDENCE_DIR)
    parser.add_argument("--tasks", type=Path, default=DEFAULT_TASKS)
    parser.add_argument("--runs-dir", type=Path, default=DEFAULT_RUNS)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--require-pass", action="store_true")
    args = parser.parse_args(argv)
    try:
        capability = evaluate_capability_gate(args.rubric, args.evidence_dir)
        task_gate = evaluate_task_win_gate(load_tasks(args.tasks), args.runs_dir)
        markdown = render(capability, task_gate)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"agent-loop completion gate: {exc}", file=sys.stderr)
        return 2
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(markdown)
    print(f"wrote {args.out}")
    if args.require_pass and not (capability.passed and task_gate.passed):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
