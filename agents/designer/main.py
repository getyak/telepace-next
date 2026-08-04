"""DesignerAgent: helps a researcher spec a study via natural language."""

# Chinese fallback copy intentionally uses native full-width punctuation.
# ruff: noqa: RUF001

from __future__ import annotations

import asyncio
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
_QUOTED_QUESTION = re.compile(r"[\"“](.+?)[\"”]")


def _sanitize_patch(patch: dict[str, Any]) -> dict[str, Any]:
    """Sanitize an LLM-produced spec patch before it is persisted.

    The model routinely invents outline item ids that merely *look* like
    UUIDs (e.g. "1a2b3c4d-5e6f-7g8h-…"); persisting them corrupts the
    projection because CampaignSpec requires real UUIDs. Replace anything
    unparsable with a fresh uuid4 and drop malformed items.
    """
    from uuid import UUID

    outline = patch.get("outline")
    if not isinstance(outline, dict):
        return patch
    items = outline.get("items")
    if not isinstance(items, list):
        return patch
    clean_items: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        raw_id = item.get("id")
        try:
            UUID(str(raw_id))
        except (ValueError, TypeError):
            item = {**item, "id": str(uuid4())}
        clean_items.append(item)
    return {**patch, "outline": {**outline, "items": clean_items}}


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


def _fallback_refine_patch(
    current_spec: dict[str, Any],
    instruction: str,
) -> dict[str, Any]:
    """Apply the simplest safe outline edit when the configured LLM is offline.

    Local/self-hosted Telepace defaults to ``MockLLM``. A precise instruction
    to add one quoted question should still perform that edit instead of
    returning a false ``refined`` success with an empty patch.
    """

    normalized = instruction.casefold()
    wants_add = any(token in normalized for token in ("add", "append", "增加", "添加"))
    mentions_question = any(token in normalized for token in ("question", "问题", "提问"))
    match = _QUOTED_QUESTION.search(instruction)
    if not (wants_add and mentions_question and match):
        return {}

    question = match.group(1).strip()
    if not question:
        return {}
    raw_outline = current_spec.get("outline", {})
    outline = dict(raw_outline) if isinstance(raw_outline, dict) else {}
    raw_items = outline.get("items", [])
    items = [dict(item) for item in raw_items if isinstance(item, dict)]
    if any(str(item.get("question", "")).casefold() == question.casefold() for item in items):
        return {}
    items.append(
        OutlineItem(
            order=len(items) + 1,
            question=question,
            goal="Address the researcher's requested refinement.",
        ).model_dump(mode="json")
    )
    outline["items"] = items
    return {"outline": outline}


def _apply_seed_to_spec(
    base: CampaignSpec, seed: dict[str, Any], *, forced_language: str | None = None
) -> CampaignSpec:
    """Merge LLM-generated seed fields into the baseline spec.

    Only trusts keys/values that pass shape checks. Anything malformed is
    dropped silently so a partial seed still contributes what it can.

    `forced_language`, when set, overrides whatever the LLM inferred for
    `primary_language` — an explicit caller-supplied language always wins.
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
    inferred_primary: str | None = None
    if isinstance(languages, list):
        langs = [str(x).strip() for x in languages if isinstance(x, str) and x.strip()]
        if langs:
            patch["languages"] = langs
            inferred_primary = langs[0]
    if forced_language is not None:
        # Explicit caller intent always wins over whatever the LLM inferred.
        patch["primary_language"] = forced_language
    elif inferred_primary is not None:
        # One-time bootstrap: establish primary_language from the LLM's own
        # language detection so subsequent refines have something to read back.
        patch["primary_language"] = inferred_primary
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
        patch["outline"] = (
            Outline(**outline_kwargs)
            if items
            else base.outline.model_copy(
                update={k: v for k, v in outline_kwargs.items() if k != "items"}
            )
        )
    return base.model_copy(update=patch)


def _fallback_seed_spec(cmd: CreateCampaign, base: CampaignSpec) -> CampaignSpec:
    """Return a useful deterministic guide when model seeding is slow or offline."""

    task = cmd.research_task
    source_text = " ".join(
        part
        for part in (
            cmd.title,
            cmd.goal,
            cmd.background,
            task.decision if task else "",
            task.objective if task else "",
            task.audience if task else "",
        )
        if part
    )
    language = cmd.primary_language or (
        "zh" if re.search(r"[\u3400-\u9fff]", source_text) else "en"
    )
    audience = task.audience.strip() if task and task.audience.strip() else ""
    objective = task.objective.strip() if task and task.objective.strip() else cmd.goal.strip()

    if language == "zh":
        persona = audience or "过去 30 天内至少每周使用一次相关产品的中国目标用户"
        seed: dict[str, Any] = {
            "hypotheses": [
                "当前流程的关键阻力集中在可控性与可信度",
                "高频用户比低频用户更能识别真实的采用障碍",
                "相反假设：问题来自组织流程，而非产品体验",
            ],
            "target_persona": persona,
            "audience_screener": [
                "过去 30 天使用过相关产品吗？",
                "通常每周使用几次？",
                f"你是否符合这类受众：{persona}？",
            ],
            "outline": [
                {
                    "question": "回想最近一次相关经历，当时要完成什么任务？",
                    "goal": "建立具体使用情境，避免泛泛表态。",
                    "max_followups": 2,
                    "branch_if_positive": "是什么让这次经历顺利？",
                    "branch_if_negative": "最先卡住的是哪一步？",
                },
                {
                    "question": "从开始到结束，你实际采取了哪些步骤？",
                    "goal": "还原真实行为与工作流。",
                    "max_followups": 2,
                    "branch_if_positive": None,
                    "branch_if_negative": None,
                },
                {
                    "question": "哪一个瞬间最让你犹豫、返工或需要人工确认？",
                    "goal": "定位高摩擦与信任断点。",
                    "max_followups": 2,
                    "branch_if_positive": "你当时如何判断可以继续？",
                    "branch_if_negative": "如果没有犹豫，什么给了你信心？",
                },
                {
                    "question": "你如何判断结果准确、可靠并且可以对外使用？",
                    "goal": "理解用户的质量判断标准。",
                    "max_followups": 2,
                    "branch_if_positive": None,
                    "branch_if_negative": None,
                },
                {
                    "question": "哪些隐私、权限或协作要求会阻止你继续使用？",
                    "goal": "识别采用与推广风险。",
                    "max_followups": 2,
                    "branch_if_positive": None,
                    "branch_if_negative": None,
                },
                {
                    "question": f"要让你支持这个决策，必须先解决哪三件事：{objective}？",
                    "goal": "形成可排序、可执行的决策输入。",
                    "max_followups": 2,
                    "branch_if_positive": None,
                    "branch_if_negative": None,
                },
            ],
            "success_criteria": [
                "至少识别 3 个可由产品或流程解决的阻碍",
                "每个关键阻碍均有至少 1 个具体行为案例支持",
            ],
            "estimated_duration_minutes": 18,
            "languages": [language],
            "recommendations": [
                "采用 CIT 关键事件法，让受访者复盘最近一次真实经历而非抽象评价。",
                "允许跳过敏感题；犹豫超过 5 秒时换一种问法。",
                "使用移动端优先的短句与无术语表达，每题只问一件事。",
                "每轮自动保存，并确保中断后仍能恢复分支与进度。",
                "优先招募近期高频用户，同时纳入少量拒用者检查幸存者偏差。",
            ],
        }
    else:
        persona = (
            audience or "target users who used the relevant product weekly in the past 30 days"
        )
        seed = {
            "hypotheses": [
                "The main friction sits in control and trust, not feature discovery.",
                "Frequent users can identify adoption blockers more reliably than occasional users.",
                "Rival hypothesis: organizational process, not product experience, causes the problem.",
            ],
            "target_persona": persona,
            "audience_screener": [
                "Have you used the relevant product in the past 30 days?",
                "How many times do you typically use it each week?",
                f"Do you match this audience: {persona}?",
            ],
            "outline": [
                {
                    "question": "Think about your most recent relevant experience. What were you trying to accomplish?",
                    "goal": "Anchor the interview in a concrete situation.",
                    "max_followups": 2,
                    "branch_if_positive": "What made that experience work well?",
                    "branch_if_negative": "Where did it first break down?",
                },
                {
                    "question": "What steps did you actually take from start to finish?",
                    "goal": "Reconstruct real behavior and workflow.",
                    "max_followups": 2,
                    "branch_if_positive": None,
                    "branch_if_negative": None,
                },
                {
                    "question": "Which moment caused the most hesitation, rework, or manual checking?",
                    "goal": "Locate high-friction and low-trust moments.",
                    "max_followups": 2,
                    "branch_if_positive": "How did you decide it was safe to continue?",
                    "branch_if_negative": "What gave you confidence without extra checking?",
                },
                {
                    "question": "How do you decide whether the result is accurate and safe to use?",
                    "goal": "Understand the user's quality bar.",
                    "max_followups": 2,
                    "branch_if_positive": None,
                    "branch_if_negative": None,
                },
                {
                    "question": "Which privacy, permission, or collaboration requirements could block adoption?",
                    "goal": "Identify rollout and adoption risks.",
                    "max_followups": 2,
                    "branch_if_positive": None,
                    "branch_if_negative": None,
                },
                {
                    "question": f"What three things must change before you would support this decision: {objective}?",
                    "goal": "Produce prioritized, actionable decision input.",
                    "max_followups": 2,
                    "branch_if_positive": None,
                    "branch_if_negative": None,
                },
            ],
            "success_criteria": [
                "Identify at least 3 blockers addressable by product or process changes.",
                "Support every critical blocker with at least 1 concrete behavior example.",
            ],
            "estimated_duration_minutes": 18,
            "languages": [language],
            "recommendations": [
                "Use CIT to reconstruct the latest real experience instead of collecting abstract opinions.",
                "Allow sensitive items to be skipped and rephrase after 5 seconds of hesitation.",
                "Keep every mobile-first question short, plain, and focused on one idea.",
                "Auto-save each turn and preserve branching and progress after interruption.",
                "Recruit recent frequent users plus a few rejecters to check survivor bias.",
            ],
        }

    return _apply_seed_to_spec(base, seed, forced_language=language)


def _refine_language_constraint(current_spec: dict[str, Any]) -> str:
    """Build the hard language-constraint line injected into refine prompts.

    Reads the already-decided `primary_language` back from the persisted
    spec so refine stops re-inferring language from free text on every turn.
    Carries an explicit escape hatch for instructions that intentionally ask
    to add/switch language.
    """
    lang = current_spec.get("primary_language", "en") if isinstance(current_spec, dict) else "en"
    return (
        f"LANGUAGE (already decided, do not change unless the instruction "
        f"explicitly asks to add/switch language): {lang}\n\n"
    )


logger = logging.getLogger(__name__)


def _consume_background_task(task: asyncio.Task[Any]) -> None:
    """Consume a late model task so a hard-deadline fallback stays warning-free."""

    if task.cancelled():
        return
    try:
        task.result()
    except asyncio.CancelledError:
        return
    except Exception as exc:
        logger.debug("late designer seed task finished with an error: %s", exc)


_SEED_INSTRUCTION = (
    "You are seeding a NEW study. This is a shipping-quality first draft: it "
    "must score 100/100 with a senior UX research director. Follow EVERY rule "
    "— each maps to a rubric line.\n\n"
    "1. LANGUAGE — Match the researcher's language exactly (detect from goal + "
    "   background). Never default to English when the goal is not in English.\n"
    "2. HYPOTHESES (3-4) — Include at least one CONTRAPOSITIVE / rival "
    "   hypothesis to guard against confirmation bias. Each ≤ 20 words / 40 "
    "   Chinese characters — sharp headline, not paragraph.\n"
    "3. TARGET_PERSONA — Concrete triple: BEHAVIOR + GEOGRAPHY + FREQUENCY "
    "   (e.g. 'past-90-day repeat customer in Chengdu, ≥ 3 visits'). "
    "   Never a generic demographic slice.\n"
    "4. SCREENER (2-4) — Each question MUST validate the persona's "
    "   DISTINGUISHING trait, not a generic behavior. If the persona is "
    "   'cross-border shopper' then one screener MUST ask about cross-border "
    "   purchases specifically; if 'parent+child' then one MUST verify the "
    "   pairing. Each ≤ 25 characters.\n"
    "5. OUTLINE (6-8) — Open-ended, sharp editorial voice. NO filler like "
    "   '请' / 'please tell me a bit about' / '一下' / 'kindly' / 'as you know'. "
    "   Each question one specific probe with a per-item goal, each ≤ 30 words. "
    "   AT LEAST 2 items MUST have a non-null branch_if_positive OR "
    "   branch_if_negative — the AI moderator adapts in real time. Progress: "
    "   context → task → reflection.\n"
    "6. SUCCESS_CRITERIA (2-3) — Each measurable (a number or a binary "
    "   condition).\n"
    "7. LANGUAGES — BCP-47 codes inferred from the goal text (e.g. ['zh'] for "
    "   Chinese, ['en','ja','pt-BR'] for a multi-market study). Never blank.\n"
    "8. RECOMMENDATIONS (5-7) — Concrete methodology + UX affordance tips the "
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
        model: str | None = None,
        seed_timeout_seconds: float = 25.0,
    ) -> None:
        self._llm = llm
        self._max_tokens = max_tokens
        self._temperature = temperature
        self._model = model
        self._seed_timeout_seconds = seed_timeout_seconds
        self._system = load_prompt("designer", prompt_version)

    async def run(self, command: Any, context: dict[str, Any], harness: Harness) -> AgentResult:
        _ = harness
        if isinstance(command, CreateCampaign):
            return await self._on_create(command)
        if isinstance(command, RefineOutline):
            return await self._on_refine(command, context)
        return AgentResult(response={"error": f"unsupported command {type(command).__name__}"})

    async def _on_create(self, cmd: CreateCampaign) -> AgentResult:
        campaign_id = cmd.campaign_id or uuid4()
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

    async def _seed_spec_via_llm(self, cmd: CreateCampaign, base: CampaignSpec) -> CampaignSpec:
        """Ask the LLM to fill in outline / hypotheses / persona / screener.

        Any failure (timeout, network error, parse error, empty text) is logged
        and falls back to a deterministic, usable guide. Campaign creation
        therefore remains bounded even when the configured model is degraded.
        """
        if cmd.primary_language is not None:
            # Apply immediately so an explicit language survives even if the
            # LLM call fails or returns no parseable seed below.
            base = base.model_copy(update={"primary_language": cmd.primary_language})
        language_directive = ""
        if cmd.primary_language is not None:
            language_directive = (
                f"\n\nLANGUAGE IS ALREADY DECIDED: {cmd.primary_language}. Do not "
                "infer or override it — write the ENTIRE seed (hypotheses, "
                "persona, screener, outline, recommendations) in this language "
                f"and set languages=['{cmd.primary_language}']."
            )
        # When the researcher's intent was clarified up-front (the assessment
        # loop), feed the distilled task in as the study's north star so every
        # seeded artifact — persona, screener, outline — serves that exact
        # decision instead of re-deriving intent from the bare goal string.
        task_directive = ""
        task = cmd.research_task
        if task is not None and (task.decision or task.objective or task.audience):
            lines = []
            if task.decision:
                lines.append(f"- Decision to inform: {task.decision}")
            if task.objective:
                lines.append(f"- Research objective: {task.objective}")
            if task.audience:
                lines.append(f"- Audience to listen to: {task.audience}")
            task_directive = (
                "\n\nRESEARCH TASK (already clarified — the study's north star; "
                "every hypothesis, the persona, the screener, and each outline "
                "question MUST serve it):\n" + "\n".join(lines)
            )
        user_msg = (
            f"Title: {cmd.title}\n"
            f"Goal: {cmd.goal}\n"
            f"Background: {cmd.background or '(none)'}\n"
            f"Target completions: {cmd.target_completions}\n"
            f"Channels: {[ch.value for ch in cmd.channels]}\n"
            f"{task_directive}\n\n"
            f"{_SEED_INSTRUCTION}"
            f"{language_directive}"
        )
        seed_task = asyncio.create_task(
            self._llm.complete(
                system=self._system,
                messages=[LLMMessage(role="user", content=user_msg)],
                model=self._model,
                max_tokens=self._max_tokens,
                temperature=self._temperature,
            )
        )
        try:
            done, _ = await asyncio.wait(
                {seed_task},
                timeout=self._seed_timeout_seconds,
                return_when=asyncio.FIRST_COMPLETED,
            )
            if not done:
                # Do not await cancellation here. Some HTTP/SDK layers defer
                # cancellation while they unwind retries, which previously
                # turned a 25-second timeout into a 60-second browser timeout.
                seed_task.cancel()
                seed_task.add_done_callback(_consume_background_task)
                logger.warning(
                    "designer seed llm call exceeded %.1fs; using fallback guide",
                    self._seed_timeout_seconds,
                )
                return _fallback_seed_spec(cmd, base)
            resp = seed_task.result()
        except Exception as exc:
            logger.warning("designer seed llm call failed: %s", exc)
            return _fallback_seed_spec(cmd, base)
        seed = _extract_json(resp.text)
        if not seed:
            logger.info("designer seed: no valid JSON in llm response; using fallback guide")
            return _fallback_seed_spec(cmd, base)
        try:
            return _apply_seed_to_spec(base, seed, forced_language=cmd.primary_language)
        except Exception as exc:  # pydantic validation etc.
            logger.warning("designer seed apply failed: %s", exc)
            return _fallback_seed_spec(cmd, base)

    async def _on_refine(self, cmd: RefineOutline, context: dict[str, Any]) -> AgentResult:
        assert cmd.campaign_id is not None
        current_spec = context.get("spec", {})
        user_msg = (
            f"Current spec JSON:\n```json\n{json.dumps(current_spec, ensure_ascii=False, indent=2)}\n```\n\n"
            f"{_refine_language_constraint(current_spec)}"
            f"Instruction: {cmd.instruction}\n\n"
            "Reply with a short natural summary AND a <spec_patch>{...}</spec_patch> JSON block "
            "containing ONLY the fields that changed."
        )
        resp = await self._llm.complete(
            system=self._system,
            messages=[LLMMessage(role="user", content=user_msg)],
            model=self._model,
            max_tokens=self._max_tokens,
            temperature=self._temperature,
        )
        patch: dict[str, Any] = {}
        m = _SPEC_PATCH.search(resp.text)
        if m:
            try:
                patch = _sanitize_patch(json.loads(m.group(1)))
            except json.JSONDecodeError:
                patch = {}
        if not patch:
            patch = _fallback_refine_patch(current_spec, cmd.instruction)
        events: list[EventBase] = [
            SpecUpdated(
                campaign_id=cmd.campaign_id,
                actor="agent:designer",
                patch=patch,
                reason=cmd.instruction[:SPEC_UPDATE_REASON_MAX],
            )
        ]
        # Keep the in-memory spec in sync with the projection: the patch is a
        # shallow top-level merge, mirroring the projector's `spec || patch`.
        # Without this the Interviewer keeps moderating with the pre-refine
        # outline while the researcher sees the refined one.
        merged_spec = {**current_spec, **patch} if patch else current_spec
        return AgentResult(
            events=events,
            state_delta={"last_designer_reply": resp.text, "spec": merged_spec},
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
            f"{_refine_language_constraint(current_spec)}"
            f"Instruction: {instruction}\n\n"
            "Reply with a short natural summary AND a <spec_patch>{...}</spec_patch> JSON block "
            "containing ONLY the fields that changed."
        )
        buf = ""
        patch_emitted = False
        async for chunk in self._llm.stream(
            system=self._system,
            messages=[LLMMessage(role="user", content=user_msg)],
            model=self._model,
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
                        patch = _sanitize_patch(json.loads(raw))
                        yield {"type": "spec_patch", "patch": patch}
                    except json.JSONDecodeError:
                        yield {"type": "spec_patch", "patch": {}, "raw": raw}
                    patch_emitted = True

        summary = _SPEC_PATCH.sub("", buf).strip()
        yield {"type": "done", "summary": summary, "full_text": buf}
