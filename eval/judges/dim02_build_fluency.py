"""Dim 2 — Build-fluency.

Deterministic. Measures how many user corrections were needed before the outline
reached "ship-ready". 12 for <=2 corrections, linear falloff to 0 at 10.
"""

from __future__ import annotations

from eval.judges._util import linear_falloff
from eval.judges.types import RubricEvidence, Score


async def judge(evidence: RubricEvidence) -> Score:
    c = evidence.corrections
    if c is None:
        return Score(
            dim=2,
            scenario_id=evidence.scenario_id,
            score=0.0,
            rationale="no evidence: corrections count missing",
            evidence_pointer=f"eval/results/{evidence.scenario_id}.json",
        )
    score = linear_falloff(float(c), good=2.0, bad=10.0)
    return Score(
        dim=2,
        scenario_id=evidence.scenario_id,
        score=score,
        rationale=f"{c} corrections to ship-ready outline (target <=2, floor at 10)",
        evidence_pointer=f"eval/results/{evidence.scenario_id}.json#corrections",
    )
