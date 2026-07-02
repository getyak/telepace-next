"""Shared types for rubric judges.

Each dim's judge consumes a `RubricEvidence` bundle (populated by an E2E driver)
and returns a `Score` on a 0..12 scale with a rationale + evidence pointer that
lets a human rater double-check the number.

Deterministic dims (1, 2, 5, 6, 9, 10) use pure Python thresholds.
LLM-as-judge dims (4, 7, 8, 11, 12) call OpenRouterLLM.
Hybrid dims (3) mix both.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class RubricEvidence:
    """All facts a judge might need to score one scenario.

    Every field is Optional so drivers can populate only what they measured. A
    judge whose evidence is missing degrades to score=0 with a "no evidence"
    rationale — the scoreboard flags this as a warning, not a silent zero.
    """

    scenario_id: str

    # Dim 1: time-to-first-question
    time_to_first_q_seconds: float | None = None

    # Dim 2: build-fluency
    corrections: int | None = None
    outline: list[dict[str, Any]] | None = None

    # Dim 3: voice latency
    end_of_speech_to_tts_ms: list[int] | None = None  # per-turn samples
    latency_ms: dict[str, int] | None = None  # freeform breakdown

    # Dim 4: voice groundedness
    transcript: list[dict[str, Any]] | None = None
    # each turn: {"role": "user"|"assistant", "text": "...", "grounded_in": [...quote spans]}

    # Dim 5: channel coverage
    channels_attempted: list[str] | None = None
    channels_succeeded: list[str] | None = None

    # Dim 6: coverage tracking
    outline_goals: list[str] | None = None
    goals_covered_in_transcript: list[str] | None = None

    # Dim 7: PII / policy safety
    policy_events: list[dict[str, Any]] | None = None
    # each event: {"type":"pii_detected"|"jailbreak_attempt"|"oos_answer","handled":bool,"note":str}

    # Dim 8: insight quality
    themes_predicted: list[str] | None = None
    themes_expected: list[str] | None = None

    # Dim 9: cost per completion
    cost_usd: float | None = None
    completions: int | None = None

    # Dim 10: time-to-insight
    interview_end_ts: float | None = None
    insight_ready_ts: float | None = None
    time_to_insight_hours: float | None = None

    # Dim 11: ops observability
    events: list[dict[str, Any]] | None = None
    # each event: {"kind":"llm_call"|"cost"|"prompt"|"latency","payload":{...}}

    # Dim 12: aesthetic polish
    ui_screenshots: list[str] | None = None
    ui_notes: str | None = None
    a11y_violations: int | None = None

    # Freeform metadata for judges that need context.
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class Score:
    dim: int
    scenario_id: str
    score: float
    rationale: str
    evidence_pointer: str
