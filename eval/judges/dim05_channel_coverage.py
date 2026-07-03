"""Dim 5 — Channel coverage.

Deterministic. Score = 2.4 * len(channels_succeeded); five channels
{link, email, sms, outbound-call, inbound-hotline} maxes at 12.
"""

from __future__ import annotations

from core.constants import DIM05_PER_CHANNEL_WEIGHT, RUBRIC_CHANNELS, RUBRIC_SCORE_MAX
from eval.judges.types import RubricEvidence, Score

CHANNELS = set(RUBRIC_CHANNELS)


async def judge(evidence: RubricEvidence) -> Score:
    succeeded = set(evidence.channels_succeeded or []) & CHANNELS
    n = len(succeeded)
    score = min(RUBRIC_SCORE_MAX, DIM05_PER_CHANNEL_WEIGHT * n)
    attempted = set(evidence.channels_attempted or []) & CHANNELS
    return Score(
        dim=5,
        scenario_id=evidence.scenario_id,
        score=score,
        rationale=(
            f"{n}/5 channels working E2E: {sorted(succeeded)} "
            f"(attempted: {sorted(attempted)})"
        ),
        evidence_pointer=f"eval/results/{evidence.scenario_id}.json#channels_succeeded",
    )
