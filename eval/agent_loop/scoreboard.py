"""Score the architecture capability audit for Telepace, Manus, and Codex Cloud.

This audit is intentionally separate from black-box task performance. It answers
"is the loop capable of this behavior?" from cited evidence; it does not claim
that a product completes a benchmark task well.

Usage:
    python -m eval.agent_loop.scoreboard
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RUBRIC = REPO_ROOT / "eval" / "datasets" / "agent_loop" / "capability-audit.json"
DEFAULT_EVIDENCE_DIR = REPO_ROOT / "eval" / "results" / "agent_loop" / "capability"
DEFAULT_OUT = REPO_ROOT / "docs" / "agent-loop-scoreboard.md"
EXPECTED_AGENTS = ("telepace", "manus", "codex_cloud")


@dataclass(frozen=True, slots=True)
class Check:
    id: str
    dimension: str
    weight: float
    description: str


def _load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text())
    except FileNotFoundError as exc:
        raise ValueError(f"missing file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON in {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def load_checks(path: Path) -> list[Check]:
    raw = _load_json(path)
    checks = [
        Check(
            id=str(item["id"]),
            dimension=str(item["dimension"]),
            weight=float(item["weight"]),
            description=str(item["description"]),
        )
        for item in raw.get("checks", [])
    ]
    if not checks:
        raise ValueError("rubric has no checks")
    if len({check.id for check in checks}) != len(checks):
        raise ValueError("rubric check ids must be unique")
    total = sum(check.weight for check in checks)
    if abs(total - 100.0) > 0.001:
        raise ValueError(f"rubric weights must total 100, got {total}")
    return checks


def validate_and_score(
    checks: list[Check], evidence: dict[str, Any], source: Path
) -> tuple[float, dict[str, float]]:
    observations = evidence.get("checks")
    if not isinstance(observations, dict):
        raise ValueError(f"{source}: checks must be an object")

    expected = {check.id for check in checks}
    unknown = set(observations) - expected
    missing = expected - set(observations)
    if unknown:
        raise ValueError(f"{source}: unknown checks: {sorted(unknown)}")
    if missing:
        raise ValueError(f"{source}: missing checks: {sorted(missing)}")

    by_dimension: dict[str, float] = {}
    total = 0.0
    for check in checks:
        observation = observations[check.id]
        if not isinstance(observation, dict):
            raise ValueError(f"{source}: {check.id} must be an object")
        value = observation.get("value")
        if not isinstance(value, int | float) or isinstance(value, bool):
            raise ValueError(f"{source}: {check.id}.value must be numeric")
        numeric = float(value)
        if numeric < 0.0 or numeric > 1.0:
            raise ValueError(f"{source}: {check.id}.value must be between 0 and 1")
        refs = observation.get("refs")
        if numeric > 0 and (
            not isinstance(refs, list)
            or not refs
            or not all(isinstance(ref, str) and ref.strip() for ref in refs)
        ):
            raise ValueError(f"{source}: positive {check.id} requires at least one evidence ref")
        points = check.weight * numeric
        total += points
        by_dimension[check.dimension] = by_dimension.get(check.dimension, 0.0) + points

    return round(total, 1), {key: round(value, 1) for key, value in by_dimension.items()}


def render(
    checks: list[Check],
    evidence_by_agent: dict[str, dict[str, Any]],
    evidence_dir: Path,
) -> str:
    dimension_order = list(dict.fromkeys(check.dimension for check in checks))
    scores: dict[str, tuple[float, dict[str, float]]] = {}
    for agent in EXPECTED_AGENTS:
        scores[agent] = validate_and_score(
            checks,
            evidence_by_agent[agent],
            evidence_dir / f"{agent}.json",
        )

    labels = {
        "telepace": "Telepace",
        "manus": "Manus",
        "codex_cloud": "Codex Cloud",
    }
    lines = [
        "# Agent Loop Capability Scoreboard",
        "",
        f"- Generated: {datetime.now(UTC).isoformat(timespec='seconds')}",
        "- Scale: 0-100; partial credit must have a concrete evidence reference.",
        "- Scope: architecture capability prior, not black-box task quality.",
        "",
        "| Agent | " + " | ".join(dimension_order) + " | Total | Evidence date |",
        "|---|" + "---:|" * (len(dimension_order) + 2),
    ]
    for agent in EXPECTED_AGENTS:
        total, dimensions = scores[agent]
        date = str(evidence_by_agent[agent].get("as_of", "unknown"))
        cells = [labels[agent]]
        cells.extend(f"{dimensions.get(dimension, 0.0):.1f}" for dimension in dimension_order)
        cells.extend([f"**{total:.1f}**", date])
        lines.append("| " + " | ".join(cells) + " |")

    lines.extend(
        [
            "",
            "## Interpretation",
            "",
            "This table is a parity audit. A higher score means the documented or implemented "
            "loop exposes more of the required control surface. It is not acceptable evidence "
            "that one agent completes tasks better than another.",
            "",
            "The overall winner is declared only by the black-box task protocol in "
            "`docs/design/agent-loop-gap-analysis.md`: same task inputs, saved run traces, "
            "at least five runs per agent/task, and a confidence-bound win over both baselines.",
            "",
        ]
    )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rubric", type=Path, default=DEFAULT_RUBRIC)
    parser.add_argument("--evidence-dir", type=Path, default=DEFAULT_EVIDENCE_DIR)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args(argv)

    try:
        checks = load_checks(args.rubric)
        evidence = {
            agent: _load_json(args.evidence_dir / f"{agent}.json")
            for agent in EXPECTED_AGENTS
        }
        markdown = render(checks, evidence, args.evidence_dir)
    except ValueError as exc:
        print(f"agent-loop scoreboard: {exc}", file=sys.stderr)
        return 2

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(markdown)
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
