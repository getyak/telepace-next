"""Dim 1 — Time-to-first-question.

Deterministic. 12 if the first published respondent-visible question lands in
< 20s from empty canvas, linear falloff to 0 at 120s (2 minutes = clearly worse
than Listen Labs's typical build time).
"""

from __future__ import annotations

from eval.judges._util import linear_falloff
from eval.judges.types import RubricEvidence, Score


async def judge(evidence: RubricEvidence) -> Score:
    t = evidence.time_to_first_q_seconds
    if t is None:
        return Score(
            dim=1,
            scenario_id=evidence.scenario_id,
            score=0.0,
            rationale="no evidence: time_to_first_q_seconds missing",
            evidence_pointer=f"eval/results/{evidence.scenario_id}.json",
        )
    score = linear_falloff(t, good=20.0, bad=120.0)
    return Score(
        dim=1,
        scenario_id=evidence.scenario_id,
        score=score,
        rationale=f"first question published in {t:.1f}s (target <20s, floor at 120s)",
        evidence_pointer=f"eval/results/{evidence.scenario_id}.json#time_to_first_q_seconds",
    )
