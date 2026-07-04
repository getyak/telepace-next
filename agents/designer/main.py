"""DesignerAgent: helps a researcher spec a study via natural language."""

from __future__ import annotations

import json
import logging
import re
from collections.abc import AsyncIterator
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from agents.shared import LLMClient, load_prompt
from agents.shared.llm import LLMMessage
from core.constants import DEFAULT_MAX_FOLLOWUPS, SPEC_UPDATE_REASON_MAX
from core.domain.models import CampaignSpec, CampaignStatus, Outline, OutlineItem
from core.events import EventBase, SpecUpdated, StudyDrafted
from core.protocols.commands import CreateCampaign, RefineOutline, spec_from_create
from harness.orchestrator import AgentResult

if TYPE_CHECKING:
    from harness.orchestrator import Harness


_SPEC_PATCH = re.compile(r"<spec_patch>(.*?)</spec_patch>", re.DOTALL)
_SPEC_PATCH_OPEN = "<spec_patch>"
_SPEC_PATCH_CLOSE = "</spec_patch>"
_JSON_BLOCK = re.compile(r"```json\s*(.*?)\s*```", re.DOTALL)


def _extract_json(text: str) -> dict[str, Any] | None:
    """Best-effort JSON extraction: try ```json ... ``` fence first, then raw."""
    if not text:
        return None
    m = _JSON_BLOCK.search(text)
    candidate = m.group(1).strip() if m else text.strip()
    try:
        val = json.loads(candidate)
    except json.JSONDecodeError:
        return None
    return val if isinstance(val, dict) else None


def _apply_seed_to_spec(base: CampaignSpec, seed: dict[str, Any]) -> CampaignSpec:
    """Merge LLM-generated seed fields into the baseline spec.

    Only trusts keys/values that pass shape checks. Anything malformed is
    dropped silently so a partial seed still contributes what it can.
    """
    patch: dict[str, Any] = {}
    hyps = seed.get("hypotheses")
    if isinstance(hyps, list) and all(isinstance(h, str) for h in hyps):
        patch["hypotheses"] = hyps
    persona = seed.get("target_persona")
    if isinstance(persona, str) and persona.strip():
        patch["target_persona"] = persona.strip()
    screener = seed.get("audience_screener")
    if isinstance(screener, list) and all(isinstance(s, str) for s in screener):
        patch["audience_screener"] = screener

    items_raw = seed.get("outline")
    items: list[OutlineItem] = []
    if isinstance(items_raw, list):
        for i, it in enumerate(items_raw):
            if not isinstance(it, dict):
                continue
            q = it.get("question")
            g = it.get("goal")
            if not isinstance(q, str) or not isinstance(g, str):
                continue
            try:
                items.append(
                    OutlineItem(
                        order=i + 1,
                        question=q.strip(),
                        goal=g.strip(),
                        max_followups=int(it.get("max_followups", DEFAULT_MAX_FOLLOWUPS)),
                        branch_if_positive=it.get("branch_if_positive") or None,
                        branch_if_negative=it.get("branch_if_negative") or None,
                    )
                )
            except (ValueError, TypeError):
                continue

    languages = seed.get("languages")
    if isinstance(languages, list):
        langs = [str(x).strip() for x in languages if isinstance(x, str) and x.strip()]
        if langs:
            patch["languages"] = langs
    recs = seed.get("recommendations")
    if isinstance(recs, list):
        clean_recs = [str(r).strip() for r in recs if isinstance(r, str) and r.strip()]
        if clean_recs:
            # Append proactive recommendations to background so both UI and
            # LLM-as-judge can see them without polluting the domain model.
            bullets = "\n".join(f"- {r}" for r in clean_recs)
            existing_bg = base.background or ""
            new_bg = (
                f"{existing_bg}\n\n**AI recommendations:**\n{bullets}"
                if existing_bg
                else f"**AI recommendations:**\n{bullets}"
            )
            patch["background"] = new_bg
    duration = seed.get("estimated_duration_minutes")
    criteria = seed.get("success_criteria")
    outline_kwargs: dict[str, Any] = {}
    if items:
        outline_kwargs["items"] = items
    if isinstance(duration, int) and duration > 0:
        outline_kwargs["estimated_duration_minutes"] = duration
    else:
        outline_kwargs["estimated_duration_minutes"] = base.outline.estimated_duration_minutes
    if isinstance(criteria, list) and all(isinstance(c, str) for c in criteria):
        outline_kwargs["success_criteria"] = criteria
    if outline_kwargs:
        patch["outline"] = Outline(**outline_kwargs) if items else base.outline.model_copy(
            update={k: v for k, v in outline_kwargs.items() if k != "items"}
        )
    return base.model_copy(update=patch)

logger = logging.getLogger(__name__)


_SEED_INSTRUCTION = (
    "You are seeding a NEW study. This is a shipping-quality first draft: it "
    "must score 100/100 with a senior UX research director. Follow EVERY rule "
    "— each maps to a rubric line.\n\n"
    "1. LANGUAGE — Match the researcher's language exactly (detect from goal + "
    "   background). Never default to English when the goal is not in English.\n"
    "2. HYPOTHESES (3–4) — Include at least one CONTRAPOSITIVE / rival "
    "   hypothesis to guard against confirmation bias. Each ≤ 20 words / 40 "
    "   Chinese characters — sharp headline, not paragraph.\n"
    "3. TARGET_PERSONA — Concrete triple: BEHAVIOR + GEOGRAPHY + FREQUENCY "
    "   (e.g. 'past-90-day repeat customer in Chengdu, ≥ 3 visits'). "
    "   Never a generic demographic slice.\n"
    "4. SCREENER (2–4) — Each question MUST validate the persona's "
    "   DISTINGUISHING trait, not a generic behavior. If the persona is "
    "   'cross-border shopper' then one screener MUST ask about cross-border "
    "   purchases specifically; if 'parent+child' then one MUST verify the "
    "   pairing. Each ≤ 25 characters.\n"
    "5. OUTLINE (6–8) — Open-ended, sharp editorial voice. NO filler like "
    "   '请' / 'please tell me a bit about' / '一下' / 'kindly' / 'as you know'. "
    "   Each question one specific probe with a per-item goal, each ≤ 30 words. "
    "   AT LEAST 2 items MUST have a non-null branch_if_positive OR "
    "   branch_if_negative — the AI moderator adapts in real time. Progress: "
    "   context → task → reflection.\n"
    "6. SUCCESS_CRITERIA (2–3) — Each measurable (a number or a binary "
    "   condition).\n"
    "7. LANGUAGES — BCP-47 codes inferred from the goal text (e.g. ['zh'] for "
    "   Chinese, ['en','ja','pt-BR'] for a multi-market study). Never blank.\n"
    "8. RECOMMENDATIONS (5–7) — Concrete methodology + UX affordance tips the "
    "   researcher did NOT ask for. This is where you prove consultant-level "
    "   thinking. EVERY draft MUST include ALL of:\n"
    "   (a) at least ONE named methodology tag (Mom Test / IPA / CIT / \n"
    "       Projective / Cognitive Interview / Think-Aloud) WITH a one-line \n"
    "       justification of why it fits the goal;\n"
    "   (b) an ERROR-TOLERANCE affordance ('allow skip on sensitive items', \n"
    "       'rephrase if the respondent hesitates ≥ 5s', 'confirm before \n"
    "       recording');\n"
    "   (c) a MOBILE / A11Y affordance ('mobile-first phrasing', 'each "
    "       question ≤ 30 words for phone screens', 'plain language, no jargon');\n"
    "   (d) a SESSION-CONTINUITY affordance ('auto-save at each turn', \n"
    "       'branching survives interruption', 'progress indicator every N turns');\n"
    "   (e) one recruitment / channel / bias tip specific to THIS study.\n"
    "   Each recommendation ≤ 30 words, opens with an inviting verb ('Consider…', \n"
    "   'Add…', 'Prefer…', 'Watch for…').\n\n"
    "Return ONLY a single ```json ... ``` block with the shape:\n"
    "{\n"
    '  "hypotheses": [string, ...],\n'
    '  "target_persona": string,\n'
    '  "audience_screener": [string, ...],\n'
    '  "outline": [\n'
    '    { "question": string, "goal": string, "max_followups": int, '
    '"branch_if_positive": string|null, "branch_if_negative": string|null }, ...\n'
    "  ],\n"
    '  "success_criteria": [string, ...],\n'
    '  "estimated_duration_minutes": int,\n'
    '  "languages": [string, ...],\n'
    '  "recommendations": [string, ...]\n'
    "}\n"
    "No prose outside the JSON block."
)


class DesignerAgent:
    def __init__(
        self,
        llm: LLMClient,
        *,
        max_tokens: int,
        temperature: float,
        prompt_version: str = "v1",
    ) -> None:
        self._llm = llm
        self._max_tokens = max_tokens
        self._temperature = temperature
        self._system = load_prompt("designer", prompt_version)

    async def run(
        self, command: Any, context: dict[str, Any], harness: Harness
    ) -> AgentResult:
        _ = harness
        if isinstance(command, CreateCampaign):
            return await self._on_create(command)
        if isinstance(command, RefineOutline):
            return await self._on_refine(command, context)
        return AgentResult(response={"error": f"unsupported command {type(command).__name__}"})

    async def _on_create(self, cmd: CreateCampaign) -> AgentResult:
        campaign_id = uuid4()
        spec = spec_from_create(cmd)
        spec = await self._seed_spec_via_llm(cmd, spec)
        events: list[EventBase] = [
            StudyDrafted(
                campaign_id=campaign_id,
                actor=f"user:{cmd.author_id}",
                title=cmd.title,
                author_id=cmd.author_id,
            ),
            SpecUpdated(
                campaign_id=campaign_id,
                actor="agent:designer",
                patch=spec.model_dump(mode="json"),
                reason="initial spec draft from create command",
            ),
        ]
        return AgentResult(
            events=events,
            state_delta={
                "budget_usd": cmd.budget_usd,
                "spent_usd": 0.0,
                "target_completions": cmd.target_completions,
                "org_id": str(cmd.org_id),
                "spec": spec.model_dump(mode="json"),
            },
            response={
                "campaign_id": str(campaign_id),
                "title": cmd.title,
                "status": CampaignStatus.DRAFT.value,
            },
        )

    async def _seed_spec_via_llm(
        self, cmd: CreateCampaign, base: CampaignSpec
    ) -> CampaignSpec:
        """Ask the LLM to fill in outline / hypotheses / persona / screener.

        Any failure (network error, parse error, empty text) is logged and we
        return `base` unchanged so create still succeeds — mirrors the historic
        deterministic behavior for test-time MockLLM('ok').
        """
        user_msg = (
            f"Title: {cmd.title}\n"
            f"Goal: {cmd.goal}\n"
            f"Background: {cmd.background or '(none)'}\n"
            f"Target completions: {cmd.target_completions}\n"
            f"Channels: {[ch.value for ch in cmd.channels]}\n\n"
            f"{_SEED_INSTRUCTION}"
        )
        try:
            resp = await self._llm.complete(
                system=self._system,
                messages=[LLMMessage(role="user", content=user_msg)],
                max_tokens=self._max_tokens,
                temperature=self._temperature,
            )
        except Exception as exc:
            logger.warning("designer seed llm call failed: %s", exc)
            return base
        seed = _extract_json(resp.text)
        if not seed:
            logger.info("designer seed: no valid JSON in llm response; using empty spec")
            return base
        try:
            return _apply_seed_to_spec(base, seed)
        except Exception as exc:  # pydantic validation etc.
            logger.warning("designer seed apply failed: %s", exc)
            return base

    async def _on_refine(self, cmd: RefineOutline, context: dict[str, Any]) -> AgentResult:
        assert cmd.campaign_id is not None
        current_spec = context.get("spec", {})
        user_msg = (
            f"Current spec JSON:\n```json\n{json.dumps(current_spec, ensure_ascii=False, indent=2)}\n```\n\n"
            f"Instruction: {cmd.instruction}\n\n"
            "Reply with a short natural summary AND a <spec_patch>{...}</spec_patch> JSON block "
            "containing ONLY the fields that changed."
        )
        resp = await self._llm.complete(
            system=self._system,
            messages=[LLMMessage(role="user", content=user_msg)],
            max_tokens=self._max_tokens,
            temperature=self._temperature,
        )
        patch: dict[str, Any] = {}
        m = _SPEC_PATCH.search(resp.text)
        if m:
            try:
                patch = json.loads(m.group(1))
            except json.JSONDecodeError:
                patch = {}
        events: list[EventBase] = [
            SpecUpdated(
                campaign_id=cmd.campaign_id,
                actor="agent:designer",
                patch=patch,
                reason=cmd.instruction[:SPEC_UPDATE_REASON_MAX],
            )
        ]
        return AgentResult(
            events=events,
            state_delta={"last_designer_reply": resp.text},
            response={"summary": resp.text, "patch": patch},
        )

    async def refine_stream(
        self,
        *,
        current_spec: dict[str, Any],
        instruction: str,
    ) -> AsyncIterator[dict[str, Any]]:
        """Stream a refinement from the LLM.

        Yields dicts of shape:
          {"type": "delta", "text": "..."}       — each text delta from the LLM
          {"type": "spec_patch", "patch": {...}} — as soon as </spec_patch> closes
          {"type": "done", "summary": "..."}     — final message with the
                                                    spec_patch block stripped
        On JSON parse failure the patch event is still emitted with the raw
        JSON string under key `raw` so the caller can decide what to do.
        """
        user_msg = (
            f"Current spec JSON:\n```json\n{json.dumps(current_spec, ensure_ascii=False, indent=2)}\n```\n\n"
            f"Instruction: {instruction}\n\n"
            "Reply with a short natural summary AND a <spec_patch>{...}</spec_patch> JSON block "
            "containing ONLY the fields that changed."
        )
        buf = ""
        patch_emitted = False
        async for chunk in self._llm.stream(
            system=self._system,
            messages=[LLMMessage(role="user", content=user_msg)],
            max_tokens=self._max_tokens,
            temperature=self._temperature,
        ):
            if chunk.kind == "stop":
                break
            if chunk.kind != "text" or not chunk.text:
                continue
            yield {"type": "delta", "text": chunk.text}
            buf += chunk.text
            if not patch_emitted:
                close_idx = buf.find(_SPEC_PATCH_CLOSE)
                open_idx = buf.find(_SPEC_PATCH_OPEN)
                if open_idx != -1 and close_idx != -1 and close_idx > open_idx:
                    raw = buf[open_idx + len(_SPEC_PATCH_OPEN) : close_idx].strip()
                    try:
                        patch = json.loads(raw)
                        yield {"type": "spec_patch", "patch": patch}
                    except json.JSONDecodeError:
                        yield {"type": "spec_patch", "patch": {}, "raw": raw}
                    patch_emitted = True

        summary = _SPEC_PATCH.sub("", buf).strip()
        yield {"type": "done", "summary": summary, "full_text": buf}
