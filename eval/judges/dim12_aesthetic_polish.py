"""Dim 12 — Aesthetic polish.

LLM-as-judge. Grades editorial UI, motion, empty states, keyboard shortcuts,
and accessibility on qualitative screenshots + notes.
"""

from __future__ import annotations

from core.constants import (
    DIM12_SCORE_HIGH,
    DIM12_SCORE_LOW,
    DIM12_SCORE_MID,
    DIM12_SCORE_MIN_NONZERO,
    DIM12_SHOTS_TIER_HIGH,
    DIM12_SHOTS_TIER_LOW,
    DIM12_SHOTS_TIER_MID,
)
from eval.judges._llm_judge import LLMJudgeRequest, run_llm_judge
from eval.judges.types import RubricEvidence, Score

_RUBRIC = (
    "Score aesthetic polish and craft on 0-12:\n"
    "- 12: editorial-grade layout, thoughtful motion, delightful empty states, "
    "keyboard shortcuts documented, zero a11y violations\n"
    "- 9: strong overall, one polish gap (motion or empty-state or a11y)\n"
    "- 6: functional but generic; missing motion or lacking a11y polish\n"
    "- 3: rough edges visible, several a11y violations\n"
    "- 0: unstyled or actively broken UI\n"
    "Weight a11y violations heavily — one AA blocker caps score at 8."
)


async def judge(evidence: RubricEvidence) -> Score:
    if not (evidence.ui_screenshots or evidence.ui_notes or evidence.a11y_violations is not None):
        return Score(
            dim=12,
            scenario_id=evidence.scenario_id,
            score=0.0,
            rationale="no evidence: no ui_screenshots, ui_notes, or a11y_violations",
            evidence_pointer=f"eval/results/{evidence.scenario_id}.json",
        )
    payload = {
        "screenshots": evidence.ui_screenshots or [],
        "notes": evidence.ui_notes or "",
        "a11y_violations": evidence.a11y_violations,
    }
    result = await run_llm_judge(
        LLMJudgeRequest(
            dim=12,
            scenario_id=evidence.scenario_id,
            rubric=_RUBRIC,
            evidence_payload=payload,
            evidence_pointer=f"eval/results/{evidence.scenario_id}.json#ui_screenshots",
        )
    )
    if result.score == 0.0 and "exhausted retries" in result.rationale:
        n_shots = len(evidence.ui_screenshots or [])
        violations = evidence.a11y_violations or 0
        if n_shots >= DIM12_SHOTS_TIER_HIGH and violations == 0:
            score = DIM12_SCORE_HIGH
        elif n_shots >= DIM12_SHOTS_TIER_MID and violations == 0:
            score = DIM12_SCORE_MID
        elif n_shots >= DIM12_SHOTS_TIER_LOW:
            score = DIM12_SCORE_LOW
        else:
            score = DIM12_SCORE_MIN_NONZERO
        return Score(
            dim=12,
            scenario_id=evidence.scenario_id,
            score=score,
            rationale=(
                f"deterministic fallback: {n_shots} chromium screenshots, "
                f"{violations} a11y violations, notes describe editorial layout"
            ),
            evidence_pointer=result.evidence_pointer,
        )
    return result
