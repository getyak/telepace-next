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
from core.domain.models import ChannelKind
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


class RefineBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    instruction: str


@router.post("")
async def create_campaign(
    body: CreateCampaignBody,
    request: Request,
    harness: Harness = Depends(get_harness),
    settings: Settings = Depends(get_settings_dep),
    user: AuthUser = Depends(require_current_user),
) -> dict:
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
