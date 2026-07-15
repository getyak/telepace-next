"""MCP tool: dispatch_invites — send invitations over email / SMS / phone."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from core.constants import ACTOR_USER
from core.protocols.commands import DispatchInvites, InviteInput
from core.protocols.mcp_tools import DispatchInvitesInput, DispatchInvitesOutput


async def dispatch_invites(
    input_data: dict[str, Any],
    *,
    harness: Any,
    author_id: UUID,
    actor_prefix_user: str = ACTOR_USER,
    **_: Any,
) -> dict[str, Any]:
    parsed = DispatchInvitesInput.model_validate(input_data)
    cmd = DispatchInvites(
        actor=f"{actor_prefix_user}:{author_id}",
        campaign_id=parsed.campaign_id,
        invites=[
            InviteInput(
                address=i.address,
                channel=i.channel,
                name=i.name,
                personalized_intro=i.personalized_intro,
            )
            for i in parsed.invites
        ],
    )
    resp = await harness.handle(cmd)
    if not resp.ok:
        raise RuntimeError(f"dispatch_invites failed: {resp.reason}")
    dispatched = (
        resp.result.get("dispatched", len(parsed.invites))
        if isinstance(resp.result, dict)
        else len(parsed.invites)
    )
    return DispatchInvitesOutput(
        campaign_id=parsed.campaign_id,
        dispatched=dispatched,
        next_actions=["call `get_campaign_progress` to watch invited respondents join"],
    ).model_dump(mode="json")
