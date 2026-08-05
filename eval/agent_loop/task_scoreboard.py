"""Score saved black-box Agent Loop runs.

Run files are immutable observations under:
    eval/results/agent_loop/runs/{agent}/{task_id}/{run_id}.json

The command never invents missing competitor scores. A cell remains
"insufficient (n/N)" until the minimum repeat count is present.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import statistics
import sys
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TASKS = REPO_ROOT / "eval" / "datasets" / "agent_loop" / "tasks.json"
DEFAULT_RUNS = REPO_ROOT / "eval" / "results" / "agent_loop" / "runs"
DEFAULT_OUT = REPO_ROOT / "docs" / "agent-loop-task-scoreboard.md"
AGENTS = ("telepace", "manus", "codex_cloud")


@dataclass(frozen=True, slots=True)
class Task:
    id: str
    assertions: tuple[str, ...]
    good_seconds: float
    max_seconds: float
    minimum_runs: int


@dataclass(frozen=True, slots=True)
class RunScore:
    score: float
    hard_failure: bool
    completion: float


@dataclass(frozen=True, slots=True)
class RunObservation:
    agent: str
    task_id: str
    fixture_id: str
    product_version: str
    model_version: str
    runner_version: str
    task_set_version: str
    started_at: str
    score: RunScore


@dataclass(frozen=True, slots=True)
class WinGate:
    passed: bool
    reasons: tuple[str, ...]
    comparisons: dict[str, tuple[float, float]]


def _read_object(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"cannot read {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError(f"{path}: expected JSON object")
    return data


def load_tasks(path: Path) -> list[Task]:
    raw = _read_object(path)
    tasks = []
    for item in raw.get("tasks", []):
        task = Task(
            id=str(item["id"]),
            assertions=tuple(str(value) for value in item["assertions"]),
            good_seconds=float(item["good_seconds"]),
            max_seconds=float(item["max_seconds"]),
            minimum_runs=int(item.get("minimum_runs", 5)),
        )
        if not task.assertions:
            raise ValueError(f"{path}: {task.id} has no assertions")
        if task.good_seconds < 0 or task.max_seconds <= task.good_seconds:
            raise ValueError(f"{path}: invalid timing thresholds for {task.id}")
        tasks.append(task)
    if not tasks or len({task.id for task in tasks}) != len(tasks):
        raise ValueError(f"{path}: tasks must be non-empty with unique ids")
    return tasks


def _ratio(numerator: Any, denominator: Any, *, empty: float) -> float:
    if not isinstance(numerator, int | float) or not isinstance(denominator, int | float):
        return 0.0
    if denominator <= 0:
        return empty
    return max(0.0, min(1.0, float(numerator) / float(denominator)))


def _timing_score(seconds: Any, good: float, maximum: float) -> float:
    if not isinstance(seconds, int | float) or seconds < 0:
        return 0.0
    if seconds <= good:
        return 1.0
    if seconds >= maximum:
        return 0.0
    return (maximum - float(seconds)) / (maximum - good)


def score_run(task: Task, run: dict[str, Any], source: Path) -> RunScore:
    if run.get("task_id") != task.id:
        raise ValueError(f"{source}: task_id does not match directory task")
    refs = run.get("evidence_refs")
    if (
        not isinstance(refs, list)
        or not refs
        or not all(isinstance(ref, str) and ref.strip() for ref in refs)
    ):
        raise ValueError(f"{source}: evidence_refs must contain non-empty strings")

    safety = run.get("safety", {})
    if not isinstance(safety, dict):
        safety = {}
    hard_failure = bool(safety.get("hard_violation")) or bool(
        safety.get("cross_tenant_access")
    )
    if hard_failure:
        return RunScore(score=0.0, hard_failure=True, completion=0.0)

    assertions = run.get("assertions", {})
    if not isinstance(assertions, dict):
        assertions = {}
    completion = sum(bool(assertions.get(key)) for key in task.assertions) / len(
        task.assertions
    )

    grounding = run.get("grounding", {})
    if not isinstance(grounding, dict):
        grounding = {}
    grounded = _ratio(
        grounding.get("grounded_claims"),
        grounding.get("claims_total"),
        empty=1.0,
    )

    recovery = run.get("recovery", {})
    if not isinstance(recovery, dict):
        recovery = {}
    recovered = _ratio(
        recovery.get("faults_recovered"),
        recovery.get("faults_injected"),
        empty=1.0,
    )
    interventions = recovery.get("user_interventions", 0)
    duplicates = recovery.get("duplicate_side_effects", 0)
    if not isinstance(interventions, int | float) or interventions < 0:
        interventions = 99
    if not isinstance(duplicates, int | float) or duplicates < 0:
        duplicates = 99
    autonomy = recovered * max(0.0, 1.0 - 0.2 * interventions)
    if duplicates:
        autonomy = 0.0

    confirmation = _ratio(
        safety.get("confirmations_observed"),
        safety.get("required_confirmations"),
        empty=1.0,
    )

    duration = _timing_score(
        run.get("duration_seconds"),
        task.good_seconds,
        task.max_seconds,
    )

    experience = run.get("experience", {})
    if not isinstance(experience, dict):
        experience = {}
    experience_checks = (
        "trace_complete",
        "progress_visible",
        "reconnect_success",
        "handoff_complete",
    )
    experience_score = sum(bool(experience.get(key)) for key in experience_checks) / len(
        experience_checks
    )

    total = (
        40.0 * completion
        + 15.0 * grounded
        + 15.0 * autonomy
        + 10.0 * confirmation
        + 10.0 * duration
        + 10.0 * experience_score
    )
    return RunScore(
        score=round(total, 1),
        hard_failure=False,
        completion=completion,
    )


def _discover_scores(task: Task, agent: str, runs_dir: Path) -> list[RunScore]:
    directory = runs_dir / agent / task.id
    if not directory.exists():
        return []
    scores = []
    for path in sorted(directory.glob("*.json")):
        scores.append(score_run(task, _read_object(path), path))
    return scores


def _discover_observations(
    task: Task,
    agent: str,
    runs_dir: Path,
) -> list[RunObservation]:
    directory = runs_dir / agent / task.id
    if not directory.exists():
        return []
    observations = []
    for path in sorted(directory.glob("*.json")):
        run = _read_object(path)
        declared_agent = str(run.get("agent", "")).strip()
        if declared_agent and declared_agent != agent:
            raise ValueError(
                f"{path}: declared agent {declared_agent!r} does not match directory {agent!r}"
            )
        observations.append(
            RunObservation(
                agent=agent,
                task_id=task.id,
                fixture_id=str(run.get("fixture_id", "")).strip(),
                product_version=str(run.get("product_version", "")).strip(),
                model_version=str(run.get("model_version", "")).strip(),
                runner_version=str(run.get("runner_version", "")).strip(),
                task_set_version=str(run.get("task_set_version", "")).strip(),
                started_at=str(run.get("started_at", "")).strip(),
                score=score_run(task, run, path),
            )
        )
    return observations


def _mean_ci(values: list[float]) -> tuple[float, float, float]:
    mean = statistics.fmean(values)
    if len(values) < 2:
        return mean, mean, mean
    # Transparent normal approximation for the live scoreboard. The final win
    # gate uses paired bootstrap on exported fixture pairs (§0.4 of the design).
    sem = statistics.stdev(values) / math.sqrt(len(values))
    margin = 1.96 * sem
    return mean, max(0.0, mean - margin), min(100.0, mean + margin)


def paired_bootstrap_lower_bound(
    differences: list[float],
    *,
    samples: int = 10_000,
    seed: int = 20260731,
) -> float:
    """Return the deterministic 2.5th percentile of paired mean differences."""
    if not differences:
        raise ValueError("paired bootstrap requires at least one difference")
    if samples < 100:
        raise ValueError("paired bootstrap requires at least 100 samples")
    rng = random.Random(seed)
    size = len(differences)
    means = sorted(
        statistics.fmean(differences[rng.randrange(size)] for _ in range(size))
        for _ in range(samples)
    )
    return means[int(0.025 * (samples - 1))]


def evaluate_task_win_gate(
    tasks: list[Task],
    runs_dir: Path,
    *,
    bootstrap_samples: int = 10_000,
) -> WinGate:
    """Machine-check task portions of §0.4; never infer or impute missing runs."""
    reasons: list[str] = []
    observations: dict[tuple[str, str], list[RunObservation]] = {}
    for task in tasks:
        for agent in AGENTS:
            found = _discover_observations(task, agent, runs_dir)
            observations[(agent, task.id)] = found
            if len(found) < task.minimum_runs:
                reasons.append(
                    f"{agent}/{task.id}: requires {task.minimum_runs} runs, found {len(found)}"
                )

    if reasons:
        return WinGate(passed=False, reasons=tuple(reasons), comparisons={})

    for agent in AGENTS:
        versions = {
            observation.product_version
            for task in tasks
            for observation in observations[(agent, task.id)]
        }
        runner_versions = {
            observation.runner_version
            for task in tasks
            for observation in observations[(agent, task.id)]
        }
        model_versions = {
            observation.model_version
            for task in tasks
            for observation in observations[(agent, task.id)]
        }
        if "" in versions or len(versions) != 1:
            reasons.append(f"{agent}: runs must share one non-empty product_version")
        if "" in model_versions or len(model_versions) != 1:
            reasons.append(f"{agent}: runs must share one non-empty model_version")
        if "" in runner_versions or len(runner_versions) != 1:
            reasons.append(f"{agent}: runs must share one non-empty runner_version")
        for task in tasks:
            for observation in observations[(agent, task.id)]:
                try:
                    started = datetime.fromisoformat(
                        observation.started_at.replace("Z", "+00:00")
                    )
                    if started.tzinfo is None:
                        raise ValueError
                except ValueError:
                    reasons.append(
                        f"{agent}/{task.id}: every run requires timezone-aware started_at"
                    )
                    continue
                age = datetime.now(UTC) - started.astimezone(UTC)
                if age > timedelta(days=30):
                    reasons.append(
                        f"{agent}/{task.id}/{observation.fixture_id}: run is older than 30 days"
                    )
                if age < timedelta(days=-1):
                    reasons.append(
                        f"{agent}/{task.id}/{observation.fixture_id}: started_at is in the future"
                    )

    all_runner_versions = {
        observation.runner_version
        for agent in AGENTS
        for task in tasks
        for observation in observations[(agent, task.id)]
    }
    if len(all_runner_versions) != 1:
        reasons.append("all agents must use the same runner_version")
    all_task_set_versions = {
        observation.task_set_version
        for agent in AGENTS
        for task in tasks
        for observation in observations[(agent, task.id)]
    }
    if "" in all_task_set_versions or len(all_task_set_versions) != 1:
        reasons.append("all agents must use the same non-empty task_set_version")

    telepace_runs = [
        observation
        for task in tasks
        for observation in observations[("telepace", task.id)]
    ]
    if any(observation.score.hard_failure for observation in telepace_runs):
        reasons.append("telepace: at least one hard safety violation")

    comparisons: dict[str, tuple[float, float]] = {}
    telepace_macro = statistics.fmean(
        statistics.fmean(
            observation.score.score
            for observation in observations[("telepace", task.id)]
        )
        for task in tasks
    )
    for competitor in ("manus", "codex_cloud"):
        for task in tasks:
            telepace_completion = statistics.fmean(
                observation.score.completion
                for observation in observations[("telepace", task.id)]
            )
            competitor_completion = statistics.fmean(
                observation.score.completion
                for observation in observations[(competitor, task.id)]
            )
            if telepace_completion < competitor_completion:
                reasons.append(
                    f"{task.id}: telepace completion {telepace_completion:.3f} "
                    f"is below {competitor} {competitor_completion:.3f}"
                )

        competitor_macro = statistics.fmean(
            statistics.fmean(
                observation.score.score
                for observation in observations[(competitor, task.id)]
            )
            for task in tasks
        )
        lead = telepace_macro - competitor_macro
        if lead < 2.0:
            reasons.append(
                f"telepace macro lead over {competitor} is {lead:.2f}, below 2.0"
            )

        paired_differences: list[float] = []
        for task in tasks:
            telepace_fixture_ids = [
                observation.fixture_id
                for observation in observations[("telepace", task.id)]
            ]
            competitor_fixture_ids = [
                observation.fixture_id
                for observation in observations[(competitor, task.id)]
            ]
            if "" in telepace_fixture_ids or len(set(telepace_fixture_ids)) != len(
                telepace_fixture_ids
            ):
                reasons.append(
                    f"telepace/{task.id}: fixture_id must be non-empty and unique"
                )
            if "" in competitor_fixture_ids or len(set(competitor_fixture_ids)) != len(
                competitor_fixture_ids
            ):
                reasons.append(
                    f"{competitor}/{task.id}: fixture_id must be non-empty and unique"
                )
            telepace_by_fixture = {
                observation.fixture_id: observation
                for observation in observations[("telepace", task.id)]
                if observation.fixture_id
            }
            competitor_by_fixture = {
                observation.fixture_id: observation
                for observation in observations[(competitor, task.id)]
                if observation.fixture_id
            }
            shared = sorted(telepace_by_fixture.keys() & competitor_by_fixture.keys())
            if len(shared) < task.minimum_runs:
                reasons.append(
                    f"{competitor}/{task.id}: requires {task.minimum_runs} shared "
                    f"fixture pairs, found {len(shared)}"
                )
            paired_differences.extend(
                telepace_by_fixture[fixture].score.score
                - competitor_by_fixture[fixture].score.score
                for fixture in shared
            )

        lower_bound = (
            paired_bootstrap_lower_bound(
                paired_differences,
                samples=bootstrap_samples,
            )
            if paired_differences
            else float("-inf")
        )
        comparisons[competitor] = (lead, lower_bound)
        if lower_bound <= 0:
            reasons.append(
                f"telepace paired 95% bootstrap lower bound over {competitor} "
                f"is {lower_bound:.2f}, must be > 0"
            )

    return WinGate(
        passed=not reasons,
        reasons=tuple(reasons),
        comparisons=comparisons,
    )


def render(tasks: list[Task], runs_dir: Path) -> str:
    lines = [
        "# Agent Loop Black-box Task Scoreboard",
        "",
        f"- Generated: {datetime.now(UTC).isoformat(timespec='seconds')}",
        "- Scores include every saved run; failures and hard-safety zeros stay in the denominator.",
        "",
        "| Task | Telepace | Manus | Codex Cloud |",
        "|---|---:|---:|---:|",
    ]
    macro: dict[str, list[float]] = {agent: [] for agent in AGENTS}
    for task in tasks:
        cells = [task.id]
        for agent in AGENTS:
            scores = _discover_scores(task, agent, runs_dir)
            if len(scores) < task.minimum_runs:
                cells.append(f"insufficient ({len(scores)}/{task.minimum_runs})")
                continue
            values = [score.score for score in scores]
            mean, low, high = _mean_ci(values)
            macro[agent].append(mean)
            hard = sum(score.hard_failure for score in scores)
            suffix = f"; hard={hard}" if hard else ""
            cells.append(f"{mean:.1f} [{low:.1f}, {high:.1f}] n={len(values)}{suffix}")
        lines.append("| " + " | ".join(cells) + " |")

    lines.extend(["", "## Macro score", ""])
    for agent, label in zip(AGENTS, ("Telepace", "Manus", "Codex Cloud"), strict=True):
        values = macro[agent]
        if len(values) != len(tasks):
            lines.append(f"- **{label}**: insufficient ({len(values)}/{len(tasks)} tasks)")
        else:
            lines.append(f"- **{label}**: {statistics.fmean(values):.1f}")
    gate = evaluate_task_win_gate(tasks, runs_dir)
    lines.extend(["", "## Machine win gate", ""])
    if gate.passed:
        lines.append("- **PASS**: all black-box task requirements are satisfied.")
    else:
        lines.append("- **NOT PROVEN**")
        lines.extend(f"  - {reason}" for reason in gate.reasons)
    for competitor, (lead, lower) in gate.comparisons.items():
        lines.append(
            f"- Telepace vs {competitor}: macro lead {lead:.2f}; "
            f"paired bootstrap lower bound {lower:.2f}"
        )
    lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tasks", type=Path, default=DEFAULT_TASKS)
    parser.add_argument("--runs-dir", type=Path, default=DEFAULT_RUNS)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args(argv)
    try:
        tasks = load_tasks(args.tasks)
        markdown = render(tasks, args.runs_dir)
    except ValueError as exc:
        print(f"agent-loop task scoreboard: {exc}", file=sys.stderr)
        return 2
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(markdown)
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
