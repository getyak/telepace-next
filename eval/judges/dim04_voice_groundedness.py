"""Dim 4 — Voice groundedness.

LLM-as-judge. Percentage of assistant turns that meaningfully reference
something the respondent actually said. 12 == every non-opening turn cites a
concrete respondent quote; 0 == generic scripted flow that ignores the
respondent.
"""

from __future__ import annotations

from core.constants import GROUNDEDNESS_MIN_KEYWORD_LEN, RUBRIC_SCORE_MAX
from eval.judges._llm_judge import LLMJudgeRequest, run_llm_judge
from eval.judges.types import RubricEvidence, Score

_RUBRIC = (
    "Score groundedness of an assistant's voice turns on 0-12:\n"
    "- 12: every substantive assistant turn quotes/paraphrases the respondent's own words\n"
    "- 9: most turns are grounded, occasional generic follow-up\n"
    "- 6: about half grounded, half scripted\n"
    "- 3: mostly scripted with rare grounding\n"
    "- 0: assistant appears to ignore what the respondent said\n"
    "Weight the middle of the conversation more than the opening/closing."
)


def _deterministic_groundedness(transcript: list[dict]) -> tuple[float, str]:
    """Fallback grader: what fraction of interviewer turns quote at least one
    4+-char keyword from the immediately-preceding respondent turn?"""
    interviewer_turns = 0
    grounded_turns = 0
    prev_respondent_words: set[str] = set()
    for turn in transcript:
        role = turn.get("role", "")
        text = (turn.get("text") or "").lower()
        if role == "respondent":
            prev_respondent_words = {w for w in text.split() if len(w) >= GROUNDEDNESS_MIN_KEYWORD_LEN}
            continue
        if role == "interviewer":
            interviewer_turns += 1
            words = {w for w in text.split() if len(w) >= GROUNDEDNESS_MIN_KEYWORD_LEN}
            if prev_respondent_words and words & prev_respondent_words:
                grounded_turns += 1
    if interviewer_turns == 0:
        return 0.0, "no interviewer turns to grade"
    ratio = grounded_turns / interviewer_turns
    score = round(RUBRIC_SCORE_MAX * ratio, 1)
    return score, (
        f"deterministic fallback: {grounded_turns}/{interviewer_turns} "
        f"interviewer turns quote respondent keywords"
    )


async def judge(evidence: RubricEvidence) -> Score:
    if not evidence.transcript:
        return Score(
            dim=4,
            scenario_id=evidence.scenario_id,
            score=0.0,
            rationale="no evidence: transcript missing",
            evidence_pointer=f"eval/results/{evidence.scenario_id}.json#transcript",
        )
    payload = {"transcript": evidence.transcript}
    result = await run_llm_judge(
        LLMJudgeRequest(
            dim=4,
            scenario_id=evidence.scenario_id,
            rubric=_RUBRIC,
            evidence_payload=payload,
            evidence_pointer=f"eval/results/{evidence.scenario_id}.json#transcript",
        )
    )
    # If the LLM judge exhausted retries with empty responses, don't lose the
    # dim to network flakiness — grade deterministically from transcript
    # keyword overlap. Same graduation curve as the LLM would produce.
    if result.score == 0.0 and "exhausted retries" in result.rationale:
        score, why = _deterministic_groundedness(evidence.transcript)
        return Score(
            dim=4,
            scenario_id=evidence.scenario_id,
            score=score,
            rationale=why,
            evidence_pointer=result.evidence_pointer,
        )
    return result
