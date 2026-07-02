"""Campaign REST endpoints."""

from __future__ import annotations

import asyncio
import json
import logging
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from agents.designer import DesignerAgent
from core.domain.models import ChannelKind
from core.protocols.commands import (
    CreateCampaign,
    DispatchInvites,
    InviteInput,
    RefineOutline,
    StartCampaign,
)
from harness import Harness
from interfaces.rest_api.deps import (
    get_harness,
    get_projector,
    get_settings_dep,
    get_state,
)
from storage.projections import CampaignProjector

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/campaigns", tags=["campaigns"])


class CreateCampaignBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    goal: str
    background: str = ""
    target_completions: int = Field(default=10, ge=1, le=1000)
    budget_usd: float = 100.0
    channels: list[ChannelKind] = Field(default_factory=lambda: [ChannelKind.WEB_TEXT])


class RefineBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    instruction: str


@router.post("")
async def create_campaign(
    body: CreateCampaignBody,
    harness: Harness = Depends(get_harness),
    settings=Depends(get_settings_dep),
) -> dict:
    cmd = CreateCampaign(
        actor=f"user:{settings.default_author_id}",
        org_id=UUID(settings.default_org_id),
        author_id=UUID(settings.default_author_id),
        title=body.title,
        goal=body.goal,
        background=body.background,
        target_completions=body.target_completions,
        budget_usd=body.budget_usd,
        channels=body.channels,
    )
    resp = await harness.handle(cmd)
    if not resp.ok:
        raise HTTPException(status_code=400, detail=resp.reason)
    return {
        "campaign_id": resp.result["campaign_id"],
        "share_url": f"{settings.public_base_url.rstrip('/')}/r/{resp.result['campaign_id']}",
        "status": resp.result["status"],
    }


@router.get("/{campaign_id}")
async def get_campaign(
    campaign_id: UUID,
    projector: CampaignProjector = Depends(get_projector),
) -> dict:
    campaign = await projector.get_campaign(campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="campaign not found")
    progress = await projector.get_progress(campaign_id)
    return {
        "campaign": campaign.model_dump(mode="json"),
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


@router.post("/{campaign_id}/refine")
async def refine_outline(
    campaign_id: UUID,
    body: RefineBody,
    harness: Harness = Depends(get_harness),
    settings=Depends(get_settings_dep),
) -> dict:
    cmd = RefineOutline(
        actor=f"user:{settings.default_author_id}",
        campaign_id=campaign_id,
        instruction=body.instruction,
    )
    resp = await harness.handle(cmd)
    if not resp.ok:
        raise HTTPException(status_code=400, detail=resp.reason)
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
    settings=Depends(get_settings_dep),
) -> StreamingResponse:
    """SSE variant of /refine.

    Streams Designer text deltas + the spec_patch the instant it closes.
    On `done`, we schedule harness.handle(cmd) as a BackgroundTask so the
    canonical SpecUpdated event still lands via the same code path used by
    the non-streaming endpoint — preserving event ordering for projections.
    """
    memory = harness._memory  # type: ignore[attr-defined]
    ctx = await memory.load(campaign_id)
    current_spec = ctx.get("spec") or {}

    state = get_state(request)
    designer = state.harness._agents.get("designer")  # type: ignore[attr-defined]
    if not isinstance(designer, DesignerAgent):
        raise HTTPException(status_code=500, detail="designer agent not registered")

    cmd = RefineOutline(
        actor=f"user:{settings.default_author_id}",
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

    # Persist the canonical event via harness AFTER the SSE closes.
    async def _persist() -> None:
        try:
            await harness.handle(cmd)
        except Exception:
            logger.exception("post-stream harness.handle failed for %s", campaign_id)

    background.add_task(_persist)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/{campaign_id}/start")
async def start_campaign(
    campaign_id: UUID,
    harness: Harness = Depends(get_harness),
    projector: CampaignProjector = Depends(get_projector),
    settings=Depends(get_settings_dep),
) -> dict:
    cmd = StartCampaign(
        actor=f"user:{settings.default_author_id}",
        campaign_id=campaign_id,
    )
    resp = await harness.handle(cmd)
    if not resp.ok:
        raise HTTPException(status_code=400, detail=resp.reason)

    # If the campaign has non-web dispatch channels configured, we log an
    # advisory in the response — actual dispatch happens via POST /dispatch,
    # which accepts explicit invite lists (address is PII, must be caller-owned).
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
    settings=Depends(get_settings_dep),
) -> dict:
    cmd = DispatchInvites(
        actor=f"user:{settings.default_author_id}",
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
        raise HTTPException(status_code=400, detail=resp.reason)
    return resp.result
