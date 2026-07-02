"""Dim 11 — Ops observability.

LLM-as-judge. Reviews the run event log and answers: can an operator see the
whole run — events, prompts, costs, latencies — without diving into raw logs?
"""

from __future__ import annotations

from eval.judges._llm_judge import LLMJudgeRequest, run_llm_judge
from eval.judges.types import RubricEvidence, Score

_RUBRIC = (
    "Score operator observability of a scenario run on 0-12:\n"
    "- 12: every LLM call, prompt, cost, and latency is visible with clear structure\n"
    "- 9: mostly visible but one category (costs or prompts) is thin\n"
    "- 6: high-level events only; deep-debug requires raw logs\n"
    "- 3: sparse events, no prompt/cost trail\n"
    "- 0: black box\n"
    "Reward structured events with a 'kind' + 'payload'; penalize free-text-only."
)


async def judge(evidence: RubricEvidence) -> Score:
    if evidence.events is None:
        return Score(
            dim=11,
            scenario_id=evidence.scenario_id,
            score=0.0,
            rationale="no evidence: events list not populated",
            evidence_pointer=f"eval/results/{evidence.scenario_id}.json#events",
        )
    sample = evidence.events[:50]
    payload = {
        "event_count": len(evidence.events),
        "sample_events": sample,
    }
    result = await run_llm_judge(
        LLMJudgeRequest(
            dim=11,
            scenario_id=evidence.scenario_id,
            rubric=_RUBRIC,
            evidence_payload=payload,
            evidence_pointer=f"eval/results/{evidence.scenario_id}.json#events",
        )
    )
    if result.score == 0.0 and "exhausted retries" in result.rationale:
        unique_kinds = len({e.get("kind") for e in sample if e.get("kind")})
        has_ts = sum(1 for e in sample if e.get("ts"))
        has_actor = sum(1 for e in sample if e.get("actor"))
        has_payload = sum(1 for e in sample if e.get("payload"))
        score = 0.0
        if unique_kinds >= 5:
            score += 3
        if sample and has_ts / len(sample) >= 0.5:
            score += 3
        if sample and has_actor / len(sample) >= 0.5:
            score += 3
        if sample and has_payload / len(sample) >= 0.5:
            score += 3
        return Score(
            dim=11,
            scenario_id=evidence.scenario_id,
            score=score,
            rationale=(
                f"deterministic fallback: {unique_kinds} event kinds, "
                f"{has_ts}/{len(sample)} with ts, {has_actor}/{len(sample)} with actor, "
                f"{has_payload}/{len(sample)} with payload"
            ),
            evidence_pointer=result.evidence_pointer,
        )
    return result
