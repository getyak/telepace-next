from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from eval.codex_stories.runner import _completed_calls, _json_lines, _tool_payload
from eval.codex_stories.scoreboard import (
    DEFAULT_STORIES,
    evaluate_suite,
    load_definitions,
)


def _write_passing_suite(run_dir: Path) -> None:
    _, definitions = load_definitions(DEFAULT_STORIES)
    traces = run_dir / "traces"
    traces.mkdir(parents=True)
    records = []
    for story in definitions:
        trace = traces / f"{story.id}.jsonl"
        trace.write_text('{"type":"turn.completed"}\n')
        records.append(
            {
                "id": story.id,
                "exit_code": 0,
                "tools_used": list(story.required_tools),
                "assertions": dict.fromkeys(story.assertions, True),
                "safety": {
                    "hard_failure": False,
                    "only_telepace_tools": True,
                },
                "trace_path": trace.relative_to(run_dir).as_posix(),
                "trace_sha256": hashlib.sha256(trace.read_bytes()).hexdigest(),
            }
        )
    (run_dir / "suite.json").write_text(
        json.dumps({"run_id": "test-run", "stories": records})
    )


def test_ten_complete_verified_stories_pass(tmp_path: Path) -> None:
    _write_passing_suite(tmp_path)

    suite = evaluate_suite(tmp_path)

    assert suite.passed is True
    assert len(suite.stories) == 10
    assert {story.score for story in suite.stories} == {100.0}


def test_one_failed_assertion_cannot_reach_99(tmp_path: Path) -> None:
    _write_passing_suite(tmp_path)
    path = tmp_path / "suite.json"
    suite = json.loads(path.read_text())
    first_key = next(iter(suite["stories"][0]["assertions"]))
    suite["stories"][0]["assertions"][first_key] = False
    path.write_text(json.dumps(suite))

    score = evaluate_suite(tmp_path)

    assert score.passed is False
    assert score.stories[0].score == 75.0


def test_trace_tampering_is_rejected(tmp_path: Path) -> None:
    _write_passing_suite(tmp_path)
    (tmp_path / "traces" / "CX-01.jsonl").write_text("tampered\n")

    with pytest.raises(ValueError, match="digest mismatch"):
        evaluate_suite(tmp_path)


def test_missing_story_evidence_is_rejected(tmp_path: Path) -> None:
    _write_passing_suite(tmp_path)
    path = tmp_path / "suite.json"
    suite = json.loads(path.read_text())
    suite["stories"].pop()
    path.write_text(json.dumps(suite))

    with pytest.raises(ValueError, match="story evidence mismatch"):
        evaluate_suite(tmp_path)


def test_codex_trace_parser_extracts_completed_tool_payload() -> None:
    payload = {"campaign_id": "c1", "status": "draft"}
    raw = json.dumps(
        {
            "type": "item.completed",
            "item": {
                "type": "mcp_tool_call",
                "server": "telepace",
                "tool": "create_campaign",
                "status": "completed",
                "result": {
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps(payload),
                        }
                    ]
                },
            },
        }
    )

    events, errors = _json_lines(raw)
    calls = _completed_calls(events)

    assert errors == []
    assert len(calls) == 1
    assert _tool_payload(calls[0]) == payload
