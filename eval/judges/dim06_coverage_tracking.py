"""Dim 6 — Coverage tracking.

Deterministic. score = 12 * covered_goals / total_goals.
Missing outline -> 0 with a "no evidence" flag.
"""

from __future__ import annotations

from core.constants import RUBRIC_SCORE_MAX
from eval.judges.types import RubricEvidence, Score


async def judge(evidence: RubricEvidence) -> Score:
    goals = evidence.outline_goals or []
    covered = evidence.goals_covered_in_transcript or []
    if not goals:
        return Score(
            dim=6,
            scenario_id=evidence.scenario_id,
            score=0.0,
            rationale="no evidence: outline_goals empty",
            evidence_pointer=f"eval/results/{evidence.scenario_id}.json#outline_goals",
        )
    covered_set = set(covered) & set(goals)
    score = RUBRIC_SCORE_MAX * len(covered_set) / len(goals)
    return Score(
        dim=6,
        scenario_id=evidence.scenario_id,
        score=score,
        rationale=f"{len(covered_set)}/{len(goals)} outline goals surfaced in transcript",
        evidence_pointer=f"eval/results/{evidence.scenario_id}.json#goals_covered_in_transcript",
    )
