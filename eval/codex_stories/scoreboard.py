"""Verify and render the 10-story Codex → Telepace acceptance gate."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_STORIES = REPO_ROOT / "eval" / "datasets" / "codex_stories" / "stories.json"
DEFAULT_RESULTS = REPO_ROOT / "eval" / "results" / "codex_stories"
DEFAULT_OUT = REPO_ROOT / "docs" / "codex-user-stories-scoreboard.md"


@dataclass(frozen=True, slots=True)
class StoryDefinition:
    id: str
    title: str
    required_tools: tuple[str, ...]
    assertions: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class StoryScore:
    id: str
    title: str
    score: float
    passed: bool
    reasons: tuple[str, ...]
    trace_path: Path


@dataclass(frozen=True, slots=True)
class SuiteScore:
    run_id: str
    minimum_score: float
    passed: bool
    stories: tuple[StoryScore, ...]
    reasons: tuple[str, ...]


def _read_object(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"cannot read {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected JSON object")
    return value


def load_definitions(path: Path = DEFAULT_STORIES) -> tuple[float, list[StoryDefinition]]:
    raw = _read_object(path)
    minimum_score = float(raw.get("minimum_score", 99.0))
    stories: list[StoryDefinition] = []
    for item in raw.get("stories", []):
        if not isinstance(item, dict):
            raise ValueError(f"{path}: every story must be an object")
        story = StoryDefinition(
            id=str(item.get("id", "")),
            title=str(item.get("title", "")),
            required_tools=tuple(str(v) for v in item.get("required_tools", [])),
            assertions=tuple(str(v) for v in item.get("assertions", [])),
        )
        if not story.id or not story.title or not story.required_tools or not story.assertions:
            raise ValueError(f"{path}: incomplete definition for {story.id or '<missing id>'}")
        stories.append(story)
    if len(stories) != 10 or len({story.id for story in stories}) != 10:
        raise ValueError(f"{path}: exactly 10 uniquely identified stories are required")
    if not 0 <= minimum_score <= 100:
        raise ValueError(f"{path}: minimum_score must be between 0 and 100")
    return minimum_score, stories


def _verified_trace_path(run_dir: Path, record: dict[str, Any]) -> Path:
    raw_path = record.get("trace_path")
    expected_hash = record.get("trace_sha256")
    if not isinstance(raw_path, str) or not raw_path:
        raise ValueError("trace_path is required")
    if not isinstance(expected_hash, str) or len(expected_hash) != 64:
        raise ValueError("trace_sha256 is required")
    path = (run_dir / raw_path).resolve()
    root = run_dir.resolve()
    if path != root and root not in path.parents:
        raise ValueError(f"trace path escapes run directory: {raw_path}")
    try:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError as exc:
        raise ValueError(f"cannot read trace {path}: {exc}") from exc
    if digest != expected_hash:
        raise ValueError(f"trace digest mismatch for {path}")
    return path


def score_story(
    definition: StoryDefinition,
    record: dict[str, Any],
    *,
    run_dir: Path,
    minimum_score: float,
) -> StoryScore:
    if record.get("id") != definition.id:
        raise ValueError(f"{definition.id}: evidence id mismatch")
    trace_path = _verified_trace_path(run_dir, record)
    assertions = record.get("assertions")
    if not isinstance(assertions, dict):
        raise ValueError(f"{definition.id}: assertions must be an object")
    if set(assertions) != set(definition.assertions):
        raise ValueError(f"{definition.id}: assertion keys do not match the dataset")
    if not all(isinstance(value, bool) for value in assertions.values()):
        raise ValueError(f"{definition.id}: assertion values must be booleans")

    tools_used = record.get("tools_used")
    if not isinstance(tools_used, list) or not all(isinstance(v, str) for v in tools_used):
        raise ValueError(f"{definition.id}: tools_used must be a string list")
    missing_tools = sorted(set(definition.required_tools) - set(tools_used))

    safety = record.get("safety")
    if not isinstance(safety, dict):
        raise ValueError(f"{definition.id}: safety must be an object")
    hard_failure = (
        bool(safety.get("hard_failure"))
        or not bool(safety.get("only_telepace_tools"))
        or int(record.get("exit_code", 1)) != 0
        or bool(missing_tools)
    )
    completed = sum(assertions.values()) / len(definition.assertions)
    score = 0.0 if hard_failure else round(100.0 * completed, 1)
    reasons = [key for key, value in assertions.items() if not value]
    reasons.extend(f"missing required tool: {tool}" for tool in missing_tools)
    if bool(safety.get("hard_failure")):
        reasons.append("hard safety failure")
    if not bool(safety.get("only_telepace_tools")):
        reasons.append("non-Telepace tool used")
    if int(record.get("exit_code", 1)) != 0:
        reasons.append(f"Codex exit code {record.get('exit_code')}")
    return StoryScore(
        id=definition.id,
        title=definition.title,
        score=score,
        passed=score >= minimum_score,
        reasons=tuple(reasons),
        trace_path=trace_path,
    )


def resolve_run_dir(results_dir: Path = DEFAULT_RESULTS) -> Path:
    pointer = _read_object(results_dir / "latest.json")
    run_id = pointer.get("run_id")
    if not isinstance(run_id, str) or not run_id:
        raise ValueError(f"{results_dir / 'latest.json'}: run_id is required")
    run_dir = (results_dir / run_id).resolve()
    if run_dir.parent != results_dir.resolve():
        raise ValueError("latest run_id is not a safe directory name")
    return run_dir


def evaluate_suite(
    run_dir: Path,
    *,
    stories_path: Path = DEFAULT_STORIES,
) -> SuiteScore:
    minimum_score, definitions = load_definitions(stories_path)
    suite = _read_object(run_dir / "suite.json")
    run_id = str(suite.get("run_id", ""))
    records = suite.get("stories")
    if not run_id or not isinstance(records, list):
        raise ValueError(f"{run_dir / 'suite.json'}: run_id and stories are required")
    by_id: dict[str, dict[str, Any]] = {}
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get("id"), str):
            raise ValueError(f"{run_dir / 'suite.json'}: malformed story evidence")
        story_id = str(record["id"])
        if story_id in by_id:
            raise ValueError(f"{run_dir / 'suite.json'}: duplicate story {story_id}")
        by_id[story_id] = record
    expected_ids = {story.id for story in definitions}
    if set(by_id) != expected_ids:
        missing = sorted(expected_ids - set(by_id))
        extra = sorted(set(by_id) - expected_ids)
        raise ValueError(f"story evidence mismatch; missing={missing}, extra={extra}")
    scores = tuple(
        score_story(
            definition,
            by_id[definition.id],
            run_dir=run_dir,
            minimum_score=minimum_score,
        )
        for definition in definitions
    )
    reasons = tuple(
        f"{story.id}: {', '.join(story.reasons) or f'score {story.score:.1f}'}"
        for story in scores
        if not story.passed
    )
    return SuiteScore(
        run_id=run_id,
        minimum_score=minimum_score,
        passed=not reasons,
        stories=scores,
        reasons=reasons,
    )


def render_markdown(suite: SuiteScore) -> str:
    lines = [
        "# Codex → Telepace: 10 User Stories",
        "",
        f"- Generated: {datetime.now(UTC).isoformat(timespec='seconds')}",
        f"- Run: `{suite.run_id}`",
        f"- Gate: **{'PASS' if suite.passed else 'FAIL'}**",
        f"- Requirement: every story ≥ {suite.minimum_score:.1f}",
        "",
        "| Story | User outcome | Score | Evidence |",
        "|---|---|---:|---|",
    ]
    for story in suite.stories:
        try:
            trace = f"../{story.trace_path.relative_to(REPO_ROOT).as_posix()}"
        except ValueError:
            trace = story.trace_path.as_posix()
        status = "PASS" if story.passed else "FAIL"
        lines.append(
            f"| {story.id} | {story.title} | {story.score:.1f} ({status}) "
            f"| [`trace`]({trace}) |"
        )
    lines.extend(["", "## Gate notes", ""])
    if suite.passed:
        lines.append(
            "All ten traces passed deterministic tool, durable-state, identity, "
            "safety, grounding, and delivery assertions."
        )
    else:
        lines.extend(f"- {reason}" for reason in suite.reasons)
    lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stories", type=Path, default=DEFAULT_STORIES)
    parser.add_argument("--results-dir", type=Path, default=DEFAULT_RESULTS)
    parser.add_argument("--run-dir", type=Path)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--require-pass", action="store_true")
    args = parser.parse_args(argv)
    try:
        run_dir = args.run_dir or resolve_run_dir(args.results_dir)
        suite = evaluate_suite(run_dir, stories_path=args.stories)
        report = render_markdown(suite)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"codex-stories scoreboard: {exc}", file=sys.stderr)
        return 2
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(report)
    print(f"wrote {args.out}: {'PASS' if suite.passed else 'FAIL'}")
    if args.require_pass and not suite.passed:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
