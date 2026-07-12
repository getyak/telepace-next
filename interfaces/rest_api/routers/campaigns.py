"""Campaign REST endpoints."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from agents.designer import DesignerAgent
from agents.shared.llm import LLMMessage
from core.constants import (
    API_VERSION_PREFIX,
    DEFAULT_BUDGET_USD,
    DEFAULT_TARGET_COMPLETIONS,
    MAX_TARGET_COMPLETIONS,
    MIN_TARGET_COMPLETIONS,
    RESPONDENT_PATH_PREFIX,
    SSE_HEADERS,
)
from core.domain.models import ChannelKind, ResearchTask
from core.protocols.commands import (
    CreateCampaign,
    DispatchInvites,
    InviteInput,
    RefineOutline,
    StartCampaign,
)
from harness import Harness
from interfaces.rest_api.auth.deps import require_current_user
from interfaces.rest_api.auth.models import AuthUser
from interfaces.rest_api.config import Settings
from interfaces.rest_api.deps import (
    get_harness,
    get_projector,
    get_settings_dep,
    get_state,
)
from interfaces.rest_api.errors import ErrorMessages
from storage.projections import CampaignProjector

_SIM_JSON_RE = re.compile(r"```json\s*(.*?)\s*```", re.DOTALL)

# The readiness bar. A study is "ready to create" only above this clarity and
# only when it actually looks like research. Below it, the agent must clarify
# rather than create — the hard gate that stops "fire-first-then-clarify".
_ASSESS_READY_CLARITY = 60


_ASSESS_SYSTEM = (
    "You are the intake analyst for a user-research platform. A researcher "
    "types an opening line. Your ONLY job is to decide whether their intent is "
    "clear enough to draft a study, and if not, what single most useful "
    "question to ask next. You NEVER draft the study itself.\n\n"
    "A study is ready to create only when three things are known:\n"
    "  - decision:  the concrete decision this research will inform\n"
    "  - objective: the one-sentence research goal\n"
    "  - audience:  who we listen to\n\n"
    "Judge honestly:\n"
    "  - If the text is not a research need at all (a speech script, marketing "
    "copy, a random paste, a greeting), set looks_like_research=false.\n"
    "  - If it is research but vague, extract whatever you can and ask for the "
    "MOST decision-relevant missing piece. Prefer decision, then audience.\n"
    "  - Only set ready=true when decision AND objective are known and "
    "clarity_score >= 60.\n\n"
    "clarifying_questions: at most 2, each with 3-4 concrete options DRAWN FROM "
    "THE TOPIC (never generic 'tell me more'), plus allow_freeform=true. Write "
    "them in the SAME LANGUAGE as the researcher's input.\n\n"
    "Reply with ONLY a single ```json ... ``` block of this exact shape:\n"
    "{\n"
    '  "looks_like_research": bool,\n'
    '  "clarity_score": int,           // 0-100\n'
    '  "decision": string,             // "" if unknown\n'
    '  "objective": string,            // "" if unknown\n'
    '  "audience": string,             // "" if unknown\n'
    '  "missing": [string, ...],       // slot names still unknown\n'
    '  "suggested_title": string,      // short study title, in input language\n'
    '  "clarifying_questions": [\n'
    '    { "id": string, "prompt": string, "multi": bool,\n'
    '      "options": [{"id": string, "label": string}, ...],\n'
    '      "allow_freeform": true }\n'
    "  ]\n"
    "}\n"
    "No prose outside the JSON block."
)


_SIMULATE_SYSTEM = (
    "You role-play as a research participant answering an interview. "
    "Stay in character: give concrete, human, specific answers grounded in the "
    "persona provided. Never break character, never mention that you are an AI. "
    "Reply ONLY with a single ```json ... ``` block matching this shape:\n"
    '{"persona_summary": string, "turns": [{"question": string, "answer": string}, ...]}'
)


_SIMULATE_PERSONA_HINTS = [
    "a busy but articulate professional who gives concrete anecdotes",
    "someone who is skeptical and hedges, but reveals a strong opinion when probed",
    "an enthusiastic early adopter who volunteers extra detail",
    "a quiet, slightly resistant participant who needs warm-up before opening up",
    "a pragmatic user who weighs cost vs. convenience in every answer",
]

logger = logging.getLogger(__name__)


def _actor_ref(settings: Settings, user: AuthUser) -> str:
    return f"{settings.actor_prefix_user}:{user.id}"


router = APIRouter(prefix=f"{API_VERSION_PREFIX}/campaigns", tags=["campaigns"])


class ResearchTaskBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: str = ""
    objective: str = ""
    audience: str = ""


class CreateCampaignBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    goal: str
    background: str = ""
    target_completions: int = Field(
        default=DEFAULT_TARGET_COMPLETIONS,
        ge=MIN_TARGET_COMPLETIONS,
        le=MAX_TARGET_COMPLETIONS,
    )
    budget_usd: float = DEFAULT_BUDGET_USD
    channels: list[ChannelKind] = Field(default_factory=lambda: [ChannelKind.WEB_TEXT])
    # BCP-47 language code (e.g. "zh", "en"). None = infer from goal/background.
    language: str | None = None
    # The distilled research task from the pre-creation assessment loop. None on
    # the legacy "create straight from goal" path.
    research_task: ResearchTaskBody | None = None


class RefineBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    instruction: str


class AssessBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    goal: str
    background: str = ""
    # Prior clarification answers, newest last. Threaded back so each assess
    # round sees the accumulated context and can converge toward ready.
    prior_context: str = ""
    language: str | None = None


@router.post("")
async def create_campaign(
    body: CreateCampaignBody,
    request: Request,
    harness: Harness = Depends(get_harness),
    settings: Settings = Depends(get_settings_dep),
    user: AuthUser = Depends(require_current_user),
) -> dict:
    research_task = (
        ResearchTask(
            decision=body.research_task.decision,
            objective=body.research_task.objective,
            audience=body.research_task.audience,
        )
        if body.research_task is not None
        else None
    )
    cmd = CreateCampaign(
        actor=_actor_ref(settings, user),
        org_id=user.org_id,
        author_id=user.id,
        title=body.title,
        goal=body.goal,
        background=body.background,
        target_completions=body.target_completions,
        budget_usd=body.budget_usd,
        channels=body.channels,
        primary_language=body.language,
        research_task=research_task,
    )
    resp = await harness.handle(cmd)
    if not resp.ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=resp.reason)
    # Sync-apply the events we just produced to the campaigns projection so
    # that a subsequent GET is guaranteed to see the row. The generic
    # subscribe-loop can't do this alone: StudyDrafted needs org_id + spec,
    # which live in harness memory populated *after* the event fires.
    campaign_id_str = resp.result["campaign_id"]
    campaign_id = UUID(campaign_id_str)
    await _apply_pending_to_projection(request, campaign_id)
    return {
        "campaign_id": campaign_id_str,
        "share_url": f"{settings.public_base_url.rstrip('/')}{RESPONDENT_PATH_PREFIX}{campaign_id_str}",
        "status": resp.result["status"],
    }


async def _apply_pending_to_projection(request: Request, campaign_id: UUID) -> None:
    """Read every event for a campaign and idempotently apply it.

    Called after write commands so the caller can immediately GET the
    projection without a race. Idempotent via ``ON CONFLICT DO NOTHING``
    on StudyDrafted and last_event_seq guarding on updates.
    """
    from core.domain.models import CampaignSpec
    from core.events import StudyDrafted

    state = get_state(request)
    stored_events = await state.event_store.read_stream(campaign_id)
    memory = state.memory
    ctx: dict = {}
    if memory is not None:
        loaded = await memory.load(campaign_id)  # type: ignore[attr-defined]
        if isinstance(loaded, dict):
            ctx = loaded
    spec_dict = ctx.get("spec")
    org_id_raw = ctx.get("org_id")
    for stored in stored_events:
        try:
            if isinstance(stored.event, StudyDrafted):
                if not spec_dict or not org_id_raw:
                    continue
                spec = CampaignSpec.model_validate(spec_dict)
                await state.projector.apply(
                    stored.seq,
                    stored.event,
                    initial_spec=spec,
                    org_id=UUID(str(org_id_raw)),
                )
            else:
                await state.projector.apply(stored.seq, stored.event)
        except Exception as exc:  # projector is idempotent + append-only
            logger.warning("projector apply failed seq=%s type=%s: %s", stored.seq, stored.event.type, exc)


@router.get("")
async def list_campaigns(
    projector: CampaignProjector = Depends(get_projector),
    user: AuthUser = Depends(require_current_user),
) -> dict:
    campaigns = await projector.list_campaigns(user.org_id)
    return {"campaigns": campaigns}


@router.get("/{campaign_id}")
async def get_campaign(
    campaign_id: UUID,
    projector: CampaignProjector = Depends(get_projector),
    settings: Settings = Depends(get_settings_dep),
    _user: AuthUser = Depends(require_current_user),
) -> dict:
    campaign = await projector.get_campaign(campaign_id)
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=ErrorMessages.CAMPAIGN_NOT_FOUND
        )
    progress = await projector.get_progress(campaign_id)
    return {
        "campaign": campaign.model_dump(mode="json"),
        "share_url": f"{settings.public_base_url.rstrip('/')}{RESPONDENT_PATH_PREFIX}{campaign_id}",
        "progress": {
            "invited": progress.invited,
            "started": progress.started,
            "completed": progress.completed,
            "abandoned": progress.abandoned,
            "avg_duration_seconds": progress.avg_duration_seconds,
            "avg_goal_coverage": progress.avg_goal_coverage,
            "spent_usd": progress.spent_usd,
        },
    }


@router.get("/{campaign_id}/insights")
async def get_campaign_insights(
    campaign_id: UUID,
    projector: CampaignProjector = Depends(get_projector),
    _user: AuthUser = Depends(require_current_user),
) -> dict:
    campaign = await projector.get_campaign(campaign_id)
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=ErrorMessages.CAMPAIGN_NOT_FOUND
        )
    rows = await projector.list_insights(campaign_id)
    grouped: dict[str, list[dict]] = {
        "themes": [],
        "verbatims": [],
        "concerns": [],
        "personas": [],
    }
    kind_to_group = {
        "theme": "themes",
        "verbatim": "verbatims",
        "concern": "concerns",
        "persona": "personas",
    }
    for row in rows:
        group = kind_to_group.get(row["kind"])
        if group is not None:
            grouped[group].append(row)
    return {
        "campaign_id": str(campaign_id),
        "total": len(rows),
        "generated_at": rows[0]["created_at"] if rows else None,
        **grouped,
    }


@router.post("/{campaign_id}/close")
async def close_campaign(
    campaign_id: UUID,
    request: Request,
    projector: CampaignProjector = Depends(get_projector),
    settings: Settings = Depends(get_settings_dep),
    user: AuthUser = Depends(require_current_user),
) -> dict:
    campaign = await projector.get_campaign(campaign_id)
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=ErrorMessages.CAMPAIGN_NOT_FOUND
        )
    from core.domain.models import CampaignStatus
    from core.events import CampaignClosed

    if campaign.status == CampaignStatus.CLOSED:
        return {"campaign_id": str(campaign_id), "status": CampaignStatus.CLOSED.value}
    state = get_state(request)
    stored = await state.event_store.append(
        CampaignClosed(
            campaign_id=campaign_id,
            actor=_actor_ref(settings, user),
            reason="closed_by_researcher",
        )
    )
    await state.projector.apply(stored.seq, stored.event)
    return {"campaign_id": str(campaign_id), "status": CampaignStatus.CLOSED.value}


@router.post("/{campaign_id}/refine")
async def refine_outline(
    campaign_id: UUID,
    body: RefineBody,
    request: Request,
    harness: Harness = Depends(get_harness),
    settings: Settings = Depends(get_settings_dep),
    user: AuthUser = Depends(require_current_user),
) -> dict:
    cmd = RefineOutline(
        actor=_actor_ref(settings, user),
        campaign_id=campaign_id,
        instruction=body.instruction,
    )
    resp = await harness.handle(cmd)
    if not resp.ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=resp.reason)
    await _apply_pending_to_projection(request, campaign_id)
    return resp.result


def _sse_pack(payload: dict) -> bytes:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode()


@router.post("/{campaign_id}/refine/stream")
async def refine_outline_stream(
    campaign_id: UUID,
    body: RefineBody,
    request: Request,
    background: BackgroundTasks,
    harness: Harness = Depends(get_harness),
    settings: Settings = Depends(get_settings_dep),
    user: AuthUser = Depends(require_current_user),
) -> StreamingResponse:
    memory = harness._memory  # type: ignore[attr-defined]
    ctx = await memory.load(campaign_id)
    current_spec = ctx.get("spec") or {}

    state = get_state(request)
    designer = state.harness._agents.get("designer")  # type: ignore[attr-defined]
    if not isinstance(designer, DesignerAgent):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorMessages.DESIGNER_AGENT_MISSING,
        )

    cmd = RefineOutline(
        actor=_actor_ref(settings, user),
        campaign_id=campaign_id,
        instruction=body.instruction,
    )

    async def event_gen():
        try:
            async for event in designer.refine_stream(
                current_spec=current_spec, instruction=body.instruction
            ):
                if await request.is_disconnected():
                    return
                yield _sse_pack(event)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("refine_stream failed for campaign %s", campaign_id)
            yield _sse_pack({"type": "error", "message": str(exc)})

    async def _persist() -> None:
        try:
            await harness.handle(cmd)
            await _apply_pending_to_projection(request, campaign_id)
        except Exception:
            logger.exception("post-stream harness.handle failed for %s", campaign_id)

    background.add_task(_persist)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


@router.post("/{campaign_id}/start")
async def start_campaign(
    campaign_id: UUID,
    request: Request,
    harness: Harness = Depends(get_harness),
    projector: CampaignProjector = Depends(get_projector),
    settings: Settings = Depends(get_settings_dep),
    user: AuthUser = Depends(require_current_user),
) -> dict:
    cmd = StartCampaign(
        actor=_actor_ref(settings, user),
        campaign_id=campaign_id,
    )
    resp = await harness.handle(cmd)
    if not resp.ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=resp.reason)
    await _apply_pending_to_projection(request, campaign_id)

    dispatchable: list[str] = []
    campaign = await projector.get_campaign(campaign_id)
    if campaign is not None:
        for ch in campaign.spec.channels:
            if ch.kind in (
                ChannelKind.EMAIL,
                ChannelKind.SMS,
                ChannelKind.PHONE_OUTBOUND,
            ):
                dispatchable.append(ch.kind.value)
    result = dict(resp.result) if isinstance(resp.result, dict) else {"result": resp.result}
    if dispatchable:
        result["dispatchable_channels"] = dispatchable
    return result


class InviteInputBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    address: str
    channel: ChannelKind
    name: str | None = None
    personalized_intro: str | None = None


class DispatchInvitesBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    invites: list[InviteInputBody] = Field(default_factory=list)


@router.post("/{campaign_id}/dispatch")
async def dispatch_invites(
    campaign_id: UUID,
    body: DispatchInvitesBody,
    harness: Harness = Depends(get_harness),
    settings: Settings = Depends(get_settings_dep),
    user: AuthUser = Depends(require_current_user),
) -> dict:
    cmd = DispatchInvites(
        actor=_actor_ref(settings, user),
        campaign_id=campaign_id,
        invites=[
            InviteInput(
                address=i.address,
                channel=i.channel,
                name=i.name,
                personalized_intro=i.personalized_intro,
            )
            for i in body.invites
        ],
    )
    resp = await harness.handle(cmd)
    if not resp.ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=resp.reason)
    return resp.result


class SimulateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    persona: str | None = Field(
        default=None,
        description=(
            "Optional persona override. If omitted, one is picked from the "
            "campaign spec's target_persona (fallback: rotating hint)."
        ),
    )
    seed: int | None = Field(
        default=None,
        description="Optional seed to vary the rotating persona hint.",
    )


def _parse_simulation(text: str) -> dict[str, Any] | None:
    if not text:
        return None
    m = _SIM_JSON_RE.search(text)
    candidate = m.group(1).strip() if m else text.strip()
    try:
        val = json.loads(candidate)
    except json.JSONDecodeError:
        return None
    if not isinstance(val, dict):
        return None
    turns = val.get("turns")
    if not isinstance(turns, list):
        return None
    clean_turns: list[dict[str, str]] = []
    for t in turns:
        if not isinstance(t, dict):
            continue
        q = t.get("question")
        a = t.get("answer")
        if isinstance(q, str) and isinstance(a, str) and q.strip() and a.strip():
            clean_turns.append({"question": q.strip(), "answer": a.strip()})
    if not clean_turns:
        return None
    persona_summary = val.get("persona_summary")
    return {
        "persona_summary": persona_summary if isinstance(persona_summary, str) else "",
        "turns": clean_turns,
    }


@router.post("/{campaign_id}/simulate")
async def simulate_interview(
    campaign_id: UUID,
    body: SimulateBody,
    request: Request,
    projector: CampaignProjector = Depends(get_projector),
    _user: AuthUser = Depends(require_current_user),
) -> dict:
    """Ask the LLM to role-play a respondent and answer the current outline.

    Used by the "AI 假想受访者试跑" drawer in the study creation UI. The
    campaign spec is fetched from the projection; the LLM sees each outline
    item's question + goal and produces a single JSON of Q/A turns.
    """
    campaign = await projector.get_campaign(campaign_id)
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=ErrorMessages.CAMPAIGN_NOT_FOUND
        )
    outline = campaign.spec.outline.items
    if not outline:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot simulate: outline is empty.",
        )

    persona = (body.persona or campaign.spec.target_persona or "").strip()
    if not persona:
        idx = (body.seed or 0) % len(_SIMULATE_PERSONA_HINTS)
        persona = _SIMULATE_PERSONA_HINTS[idx]

    outline_json = [
        {"order": q.order, "question": q.question, "goal": q.goal}
        for q in outline
    ]
    languages = campaign.spec.languages or []
    language_hint = (
        f"Answer in the same language(s) as the study: {languages}. "
        if languages
        else ""
    )
    user_msg = (
        f"Persona: {persona}\n\n"
        f"Study goal: {campaign.spec.goal}\n"
        f"Background: {campaign.spec.background or '(none)'}\n\n"
        f"{language_hint}"
        f"Answer these questions IN ORDER as this persona would in a real "
        f"interview. Be specific, concrete, and honest. Length: 1-3 sentences "
        f"per answer.\n\n"
        f"Questions:\n{json.dumps(outline_json, ensure_ascii=False, indent=2)}"
    )

    state = get_state(request)
    llm = state.llm
    if llm is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM unavailable",
        )
    try:
        resp = await llm.complete(  # type: ignore[attr-defined]
            system=_SIMULATE_SYSTEM,
            messages=[LLMMessage(role="user", content=user_msg)],
            max_tokens=state.settings.designer_max_tokens,
            temperature=0.7,
        )
    except Exception as exc:
        logger.warning("simulate llm call failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"LLM error: {exc}"
        ) from exc

    parsed = _parse_simulation(resp.text)
    if parsed is None:
        return {
            "persona_used": persona,
            "turns": [],
            "raw_reply": resp.text,
            "parse_ok": False,
        }
    return {
        "persona_used": persona,
        "persona_summary": parsed["persona_summary"],
        "turns": parsed["turns"],
        "parse_ok": True,
    }


# --------------------------------------------------------------------------- #
# Task assessment — the pre-creation readiness gate.
#
# The single most important behavior change: a study is NOT created from the
# researcher's first sentence. Instead the agent assesses whether their intent
# is clear (decision + objective + audience), and if not, clarifies first. This
# endpoint is a thin, stateless LLM call — no campaign_id, no event sourcing —
# mirroring /simulate. The frontend loops on it until `ready`, then creates.
# --------------------------------------------------------------------------- #

# Words that signal genuine research intent — used only by the deterministic
# fallback (when the LLM is a mock or unreachable), never as the primary judge.
_RESEARCH_SIGNAL = re.compile(
    r"understand|learn|why|research|study|interview|feedback|user|customer|"
    r"survey|explore|discover|reaction|decide|了解|调研|研究|访谈|反馈|用户|"
    r"客户|为什么|流失|留存|偏好|体验|决策|洞察",
    re.IGNORECASE,
)


def _assess_fallback(goal: str, prior_context: str) -> dict[str, Any]:
    """Deterministic assessment when no real LLM is available.

    Keeps dev/test/mock environments moving: a substantive research-shaped goal
    is treated as ready (so creation isn't blocked), while a too-short or
    non-research goal asks one generic clarifying question. This mirrors the
    designer seed's "degrade gracefully, never hard-fail" philosophy.
    """
    combined = f"{goal} {prior_context}".strip()
    looks_like_research = bool(_RESEARCH_SIGNAL.search(combined))
    long_enough = len(combined) >= 8
    ready = looks_like_research and long_enough
    return {
        "looks_like_research": looks_like_research,
        "clarity_score": 70 if ready else 30,
        "decision": "",
        "objective": goal.strip() if ready else "",
        "audience": "",
        "missing": [] if ready else ["decision", "audience"],
        "suggested_title": goal.strip()[:60],
        "clarifying_questions": [],
        "ready": ready,
    }


def _clean_clarify_questions(raw: Any) -> list[dict[str, Any]]:
    """Validate and normalize the LLM's clarifying_questions array."""
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for i, q in enumerate(raw[:2]):  # at most 2 per round
        if not isinstance(q, dict):
            continue
        prompt = q.get("prompt")
        if not isinstance(prompt, str) or not prompt.strip():
            continue
        opts_raw = q.get("options")
        options: list[dict[str, str]] = []
        if isinstance(opts_raw, list):
            for j, o in enumerate(opts_raw[:4]):
                if not isinstance(o, dict):
                    continue
                label = o.get("label")
                if not isinstance(label, str) or not label.strip():
                    continue
                oid = o.get("id")
                options.append(
                    {"id": str(oid) if oid else f"opt-{i}-{j}", "label": label.strip()}
                )
        out.append(
            {
                "id": str(q.get("id") or f"q-{i}"),
                "prompt": prompt.strip(),
                "multi": bool(q.get("multi", False)),
                "options": options,
                "allow_freeform": True,
            }
        )
    return out


def _parse_assessment(text: str, *, goal: str, prior_context: str) -> dict[str, Any]:
    """Parse the LLM assessment; fall back to deterministic on any failure."""
    if not text:
        return _assess_fallback(goal, prior_context)
    m = _SIM_JSON_RE.search(text)
    candidate = m.group(1).strip() if m else text.strip()
    try:
        val = json.loads(candidate)
    except json.JSONDecodeError:
        return _assess_fallback(goal, prior_context)
    if not isinstance(val, dict):
        return _assess_fallback(goal, prior_context)

    def _str(key: str) -> str:
        v = val.get(key)
        return v.strip() if isinstance(v, str) else ""

    decision = _str("decision")
    objective = _str("objective")
    try:
        clarity = int(val.get("clarity_score", 0))
    except (ValueError, TypeError):
        clarity = 0
    clarity = max(0, min(100, clarity))
    looks_like_research = bool(val.get("looks_like_research", True))
    missing = [str(x) for x in val.get("missing", []) if isinstance(x, str)]
    questions = _clean_clarify_questions(val.get("clarifying_questions"))
    # Authoritative ready rule (server-side, not the LLM's own boolean): needs a
    # decision + objective, real research, and clarity above the bar.
    ready = (
        looks_like_research
        and clarity >= _ASSESS_READY_CLARITY
        and bool(decision)
        and bool(objective)
    )
    return {
        "looks_like_research": looks_like_research,
        "clarity_score": clarity,
        "decision": decision,
        "objective": objective,
        "audience": _str("audience"),
        "missing": missing,
        "suggested_title": _str("suggested_title") or goal.strip()[:60],
        "clarifying_questions": [] if ready else questions,
        "ready": ready,
    }


@router.post("/assess")
async def assess_task(
    body: AssessBody,
    request: Request,
    _user: AuthUser = Depends(require_current_user),
) -> dict:
    """Assess whether a researcher's intent is clear enough to draft a study.

    Returns a readiness verdict + the distilled task (decision/objective/
    audience) + clarifying questions when not ready. The frontend loops on this
    before ever calling POST /campaigns — no study exists until `ready`.
    """
    goal = body.goal.strip()
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="goal is required"
        )

    state = get_state(request)
    llm = state.llm
    if llm is None:
        # No LLM configured at all — degrade to the deterministic gate rather
        # than 503, so the create flow still works in minimal deployments.
        return _assess_fallback(goal, body.prior_context)

    language_hint = (
        f"The study language is {body.language}. Write clarifying questions in it.\n"
        if body.language
        else ""
    )
    user_msg = (
        f"{language_hint}"
        f"Researcher's opening line:\n{goal}\n\n"
        + (
            f"Background: {body.background}\n\n"
            if body.background.strip()
            else ""
        )
        + (
            f"Clarification so far (their answers to earlier questions):\n"
            f"{body.prior_context}\n\n"
            if body.prior_context.strip()
            else ""
        )
    )
    try:
        resp = await llm.complete(  # type: ignore[attr-defined]
            system=_ASSESS_SYSTEM,
            messages=[LLMMessage(role="user", content=user_msg)],
            max_tokens=state.settings.designer_max_tokens,
            temperature=0.2,
        )
    except Exception as exc:
        logger.warning("assess llm call failed: %s — using fallback", exc)
        return _assess_fallback(goal, body.prior_context)

    return _parse_assessment(resp.text, goal=goal, prior_context=body.prior_context)
