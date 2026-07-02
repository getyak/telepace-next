"""Dim 3 — Voice latency (hybrid).

Deterministic on measured end-of-speech -> TTS-start (P50). Flags a warning if
no samples were captured. 12 at <=800ms, 0 at >=2500ms (linear).
"""

from __future__ import annotations

import statistics

from eval.judges._util import linear_falloff
from eval.judges.types import RubricEvidence, Score


async def judge(evidence: RubricEvidence) -> Score:
    samples = evidence.end_of_speech_to_tts_ms
    if not samples:
        return Score(
            dim=3,
            scenario_id=evidence.scenario_id,
            score=0.0,
            rationale="warning: no voice-latency samples captured",
            evidence_pointer=f"eval/results/{evidence.scenario_id}.json#end_of_speech_to_tts_ms",
        )
    p50 = float(statistics.median(samples))
    score = linear_falloff(p50, good=800.0, bad=2500.0)
    return Score(
        dim=3,
        scenario_id=evidence.scenario_id,
        score=score,
        rationale=f"P50 end-of-speech->TTS = {p50:.0f}ms across {len(samples)} turns "
        f"(target <=800ms, floor at 2500ms)",
        evidence_pointer=f"eval/results/{evidence.scenario_id}.json#end_of_speech_to_tts_ms",
    )
