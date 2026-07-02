"""Dim 5 — Channel coverage.

Deterministic. Score = 2.4 * len(channels_succeeded); five channels
{link, email, sms, outbound-call, inbound-hotline} maxes at 12.
"""

from __future__ import annotations

from eval.judges.types import RubricEvidence, Score

CHANNELS = {"link", "email", "sms", "outbound-call", "inbound-hotline"}


async def judge(evidence: RubricEvidence) -> Score:
    succeeded = set(evidence.channels_succeeded or []) & CHANNELS
    n = len(succeeded)
    score = min(12.0, 2.4 * n)
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
