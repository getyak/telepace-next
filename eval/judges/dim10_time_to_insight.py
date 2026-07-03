"""Dim 10 — Time-to-insight.

Deterministic. 12 at <=1h from last interview end to clustered themes visible,
0 at >=24h (linear).
"""

from __future__ import annotations

from core.constants import DIM10_BAD_HOURS, DIM10_GOOD_HOURS, SECONDS_PER_HOUR
from eval.judges._util import linear_falloff
from eval.judges.types import RubricEvidence, Score


async def judge(evidence: RubricEvidence) -> Score:
    hours = evidence.time_to_insight_hours
    if hours is None and evidence.interview_end_ts and evidence.insight_ready_ts:
        hours = (evidence.insight_ready_ts - evidence.interview_end_ts) / SECONDS_PER_HOUR
    if hours is None:
        return Score(
            dim=10,
            scenario_id=evidence.scenario_id,
            score=0.0,
            rationale="no evidence: time_to_insight_hours missing",
            evidence_pointer=f"eval/results/{evidence.scenario_id}.json",
        )
    score = linear_falloff(hours, good=DIM10_GOOD_HOURS, bad=DIM10_BAD_HOURS)
    return Score(
        dim=10,
        scenario_id=evidence.scenario_id,
        score=score,
        rationale=(
            f"insights ready {hours:.2f}h after interview end "
            f"(target <={DIM10_GOOD_HOURS:g}h, floor {DIM10_BAD_HOURS:g}h)"
        ),
        evidence_pointer=f"eval/results/{evidence.scenario_id}.json#time_to_insight_hours",
    )
