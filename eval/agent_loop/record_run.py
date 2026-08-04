"""Validate and immutably record one black-box Agent Loop observation.

Usage:
    python -m eval.agent_loop.record_run --input /path/to/exported-run.json

The destination is derived only after validating the agent, task, and safe run
identifier. Existing observations are never overwritten.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from eval.agent_loop.task_scoreboard import (
    AGENTS,
    DEFAULT_RUNS,
    DEFAULT_TASKS,
    load_tasks,
    score_run,
)

_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
_REQUIRED_METADATA = (
    "agent",
    "task_id",
    "run_id",
    "fixture_id",
    "product_version",
    "model_version",
    "runner_version",
    "task_set_version",
    "started_at",
)


def _read_object(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"cannot read {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected JSON object")
    return value


def validate_record(
    run: dict[str, Any],
    *,
    tasks_path: Path = DEFAULT_TASKS,
    source: Path = Path("<input>"),
) -> tuple[str, str, str]:
    missing = [
        key
        for key in _REQUIRED_METADATA
        if not isinstance(run.get(key), str) or not str(run[key]).strip()
    ]
    if missing:
        raise ValueError(f"{source}: missing metadata: {', '.join(missing)}")

    agent = str(run["agent"])
    task_id = str(run["task_id"])
    run_id = str(run["run_id"])
    if agent not in AGENTS:
        raise ValueError(f"{source}: unsupported agent {agent!r}")
    if not _SAFE_ID.fullmatch(run_id):
        raise ValueError(f"{source}: run_id must be a safe filename component")

    tasks = {task.id: task for task in load_tasks(tasks_path)}
    task = tasks.get(task_id)
    if task is None:
        raise ValueError(f"{source}: unknown task_id {task_id!r}")
    expected_task_set_version = str(_read_object(tasks_path).get("version", ""))
    if str(run["task_set_version"]) != expected_task_set_version:
        raise ValueError(
            f"{source}: task_set_version {run['task_set_version']!r} does not match "
            f"dataset version {expected_task_set_version!r}"
        )
    score_run(task, run, source)
    return agent, task_id, run_id


def record_run(
    input_path: Path,
    *,
    tasks_path: Path = DEFAULT_TASKS,
    runs_dir: Path = DEFAULT_RUNS,
) -> Path:
    run = _read_object(input_path)
    agent, task_id, run_id = validate_record(
        run,
        tasks_path=tasks_path,
        source=input_path,
    )
    destination = runs_dir / agent / task_id / f"{run_id}.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with destination.open("x") as handle:
            json.dump(run, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
    except FileExistsError as exc:
        raise ValueError(f"refusing to overwrite immutable run: {destination}") from exc
    return destination


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--tasks", type=Path, default=DEFAULT_TASKS)
    parser.add_argument("--runs-dir", type=Path, default=DEFAULT_RUNS)
    args = parser.parse_args(argv)
    try:
        destination = record_run(
            args.input,
            tasks_path=args.tasks,
            runs_dir=args.runs_dir,
        )
    except ValueError as exc:
        print(f"agent-loop record run: {exc}", file=sys.stderr)
        return 2
    print(f"recorded {destination}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
