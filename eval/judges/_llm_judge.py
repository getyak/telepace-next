"""Shared LLM-as-judge scaffolding.

Uses OpenRouterLLM per the task spec. Falls back to a deterministic "no evidence"
score of 0 when the provider is `mock` or the API key is missing — this keeps
the scoreboard runnable in CI without secrets.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from agents.shared.llm import LLMMessage, LLMResponse, MockLLM, OpenRouterLLM
from core.constants import (
    JUDGE_FALLBACK_TEMPERATURE,
    JUDGE_MAX_TOKENS,
    JUDGE_RETRY_ATTEMPTS,
    JUDGE_RETRY_BASE_DELAY_S,
    JUDGE_TEMPERATURE,
    RUBRIC_SCORE_MAX,
    RUBRIC_SCORE_MIN,
)
from eval.judges.types import Score

_SYSTEM = (
    "You are grading a user-research platform feature on a strict 0-12 scale. "
    "Return ONLY a JSON object of the form {\"score\": <int 0-12>, \"rationale\": \"<one sentence>\"}. "
    "Do not include prose outside the JSON."
)


@dataclass
class LLMJudgeRequest:
    dim: int
    scenario_id: str
    rubric: str
    evidence_payload: dict[str, Any]
    evidence_pointer: str


def _build_client():
    # Lazy import so the scoreboard can run without the API config in place.
    try:
        from interfaces.rest_api.config import get_settings

        s = get_settings()
    except Exception:
        return MockLLM()
    if s.llm_provider == "openrouter" and s.openrouter_api_key:
        return OpenRouterLLM(
            api_key=s.openrouter_api_key,
            default_model=s.llm_model_general,
            base_url=s.openrouter_base_url,
        )
    return MockLLM()


def _parse_score(resp: LLMResponse) -> tuple[float, str]:
    text = (resp.text or "").strip()
    # Strip Markdown fences if any.
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        text = match.group(0)
    try:
        obj = json.loads(text)
        raw = float(obj.get("score", 0))
        rationale = str(obj.get("rationale", "")).strip() or "(no rationale)"
        return max(RUBRIC_SCORE_MIN, min(RUBRIC_SCORE_MAX, raw)), rationale
    except (json.JSONDecodeError, ValueError, TypeError):
        return 0.0, f"judge returned unparseable output: {text[:120]!r}"


_FALLBACK_SYSTEM = (
    "You are grading a user-research platform feature on a strict 0-12 scale. "
    "You MUST reply with exactly one line of valid JSON and nothing else. "
    "Schema: {\"score\": <int 0..12>, \"rationale\": \"<one short sentence>\"}. "
    "If unsure, still return your best-guess integer score — never leave the response empty."
)


async def _call_once(
    client, system: str, user_content: str, temperature: float
) -> LLMResponse:
    return await client.complete(
        system=system,
        messages=[LLMMessage(role="user", content=user_content)],
        max_tokens=JUDGE_MAX_TOKENS,
        temperature=temperature,
    )


async def run_llm_judge(req: LLMJudgeRequest) -> Score:
    client = _build_client()
    if isinstance(client, MockLLM):
        return Score(
            dim=req.dim,
            scenario_id=req.scenario_id,
            score=0.0,
            rationale="warning: LLM provider not configured — dim requires OpenRouter (llm_model_general)",
            evidence_pointer=req.evidence_pointer,
        )
    user_content = (
        f"Rubric:\n{req.rubric}\n\n"
        f"Evidence:\n{json.dumps(req.evidence_payload, ensure_ascii=False, indent=2)}"
    )

    import asyncio

    last_err = ""
    # 3 primary attempts, then 1 fallback with stricter prompt + temp bump.
    # Empty '' response is the observed failure — treat as retryable.
    for attempt in range(JUDGE_RETRY_ATTEMPTS):
        try:
            resp = await _call_once(
                client, _SYSTEM, user_content, temperature=JUDGE_TEMPERATURE
            )
            if (resp.text or "").strip():
                score, rationale = _parse_score(resp)
                return Score(
                    dim=req.dim,
                    scenario_id=req.scenario_id,
                    score=score,
                    rationale=rationale,
                    evidence_pointer=req.evidence_pointer,
                )
            last_err = "empty response"
        except Exception as exc:  # pragma: no cover
            last_err = f"{exc.__class__.__name__}: {exc}"
        await asyncio.sleep(JUDGE_RETRY_BASE_DELAY_S * (2**attempt))

    try:
        resp = await _call_once(
            client, _FALLBACK_SYSTEM, user_content, temperature=JUDGE_FALLBACK_TEMPERATURE
        )
        if (resp.text or "").strip():
            score, rationale = _parse_score(resp)
            return Score(
                dim=req.dim,
                scenario_id=req.scenario_id,
                score=score,
                rationale=f"[fallback] {rationale}",
                evidence_pointer=req.evidence_pointer,
            )
        last_err = "fallback also empty"
    except Exception as exc:  # pragma: no cover
        last_err = f"fallback failed: {exc.__class__.__name__}: {exc}"

    return Score(
        dim=req.dim,
        scenario_id=req.scenario_id,
        score=0.0,
        rationale=f"LLM judge exhausted retries: {last_err}",
        evidence_pointer=req.evidence_pointer,
    )
