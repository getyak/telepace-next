"""Dim 9 — Cost per completion.

Deterministic. 12 at <=$1.50/completion, 0 at >=$6.00 (linear).
"""

from __future__ import annotations

from core.constants import DIM09_BAD_USD, DIM09_GOOD_USD
from eval.judges._util import linear_falloff
from eval.judges.types import RubricEvidence, Score


async def judge(evidence: RubricEvidence) -> Score:
    cost = evidence.cost_usd
    completions = evidence.completions
    if cost is None or not completions:
        return Score(
            dim=9,
            scenario_id=evidence.scenario_id,
            score=0.0,
            rationale="no evidence: cost_usd or completions missing",
            evidence_pointer=f"eval/results/{evidence.scenario_id}.json",
        )
    per = cost / completions
    score = linear_falloff(per, good=DIM09_GOOD_USD, bad=DIM09_BAD_USD)
    return Score(
        dim=9,
        scenario_id=evidence.scenario_id,
        score=score,
        rationale=(
            f"${per:.2f}/completion (${cost:.2f} over {completions}; "
            f"target <=${DIM09_GOOD_USD:g}, floor ${DIM09_BAD_USD:g})"
        ),
        evidence_pointer=f"eval/results/{evidence.scenario_id}.json#cost_usd",
    )
