"""Dim 8 — Insight quality.

LLM-as-judge. Compares predicted themes vs. hand-labeled expected themes from
the seed dataset. Semantic match, not string match.
"""

from __future__ import annotations

from core.constants import GROUNDEDNESS_MIN_KEYWORD_LEN, RUBRIC_SCORE_MAX
from eval.judges._llm_judge import LLMJudgeRequest, run_llm_judge
from eval.judges.types import RubricEvidence, Score

_RUBRIC = (
    "Score theme-cluster quality vs. hand-labeled ground truth on 0-12:\n"
    "- 12: every expected theme has a semantic match in predicted; no hallucinated themes\n"
    "- 9: >=80% recall, one minor extra/missing\n"
    "- 6: ~60% recall, mixed noise\n"
    "- 3: <40% recall or noisy/generic themes\n"
    "- 0: themes are boilerplate or clearly wrong\n"
    "Semantic match — reward paraphrase, punish string-match-only or hallucinated content."
)


def _deterministic_theme_overlap(
    predicted: list[str], expected: list[str]
) -> tuple[float, str]:
    if not expected:
        return 0.0, "expected themes empty"
    exp_words = [
        {w for w in t.lower().split() if len(w) >= GROUNDEDNESS_MIN_KEYWORD_LEN}
        for t in expected
    ]
    pred_text = " ".join(predicted).lower()
    hits = sum(
        1 for words in exp_words if words and any(w in pred_text for w in words)
    )
    ratio = hits / len(expected)
    return round(RUBRIC_SCORE_MAX * ratio, 1), (
        f"deterministic fallback: {hits}/{len(expected)} expected themes "
        f"have keyword overlap in predicted set"
    )


async def judge(evidence: RubricEvidence) -> Score:
    if evidence.themes_predicted is None or evidence.themes_expected is None:
        return Score(
            dim=8,
            scenario_id=evidence.scenario_id,
            score=0.0,
            rationale="no evidence: themes_predicted or themes_expected missing",
            evidence_pointer=f"eval/results/{evidence.scenario_id}.json#themes_predicted",
        )
    payload = {
        "predicted": evidence.themes_predicted,
        "expected": evidence.themes_expected,
    }
    result = await run_llm_judge(
        LLMJudgeRequest(
            dim=8,
            scenario_id=evidence.scenario_id,
            rubric=_RUBRIC,
            evidence_payload=payload,
            evidence_pointer=f"eval/results/{evidence.scenario_id}.json#themes_predicted",
        )
    )
    if result.score == 0.0 and "exhausted retries" in result.rationale:
        score, why = _deterministic_theme_overlap(
            evidence.themes_predicted, evidence.themes_expected
        )
        return Score(
            dim=8,
            scenario_id=evidence.scenario_id,
            score=score,
            rationale=why,
            evidence_pointer=result.evidence_pointer,
        )
    return result
