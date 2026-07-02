"""DispatchHandler: fan a `DispatchInvites` command out to channel adapters.

This handler is the only pipeline stage that resolves a raw address to an
adapter. It emits one `InviteDispatched` event per invite with the raw address
hashed (SHA-256 truncated to 16 hex chars), so PII never enters the event log.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

from core.domain.models import ChannelKind
from core.events import EventBase, InviteDispatched
from core.protocols.commands import DispatchInvites, InviteInput
from harness.orchestrator import AgentResult
from interfaces.channels.base import (
    DispatchReceipt,
    EmailDispatcher,
    Invite,
    PhoneDispatcher,
    SmsDispatcher,
)

if TYPE_CHECKING:
    from harness.orchestrator import Harness

logger = logging.getLogger(__name__)


def hash_address(address: str) -> str:
    """PII-hygiene: never log raw address; store a truncated SHA-256 instead."""

    return hashlib.sha256(address.encode("utf-8")).hexdigest()[:16]


def _build_email_content(
    invite_in: InviteInput, spec_title: str, spec_goal: str, share_url: str
) -> tuple[str, str, str]:
    subject = f"You're invited: {spec_title}"
    greeting = f"Hi {invite_in.name}," if invite_in.name else "Hi there,"
    intro = invite_in.personalized_intro or f"We're running a short study: {spec_goal}"
    body_text = (
        f"{greeting}\n\n"
        f"{intro}\n\n"
        f"It takes ~10 minutes. Start here: {share_url}\n\n"
        "Thanks,\nThe telepace team"
    )
    body_html = (
        f"<p>{greeting}</p>"
        f"<p>{intro}</p>"
        f'<p>It takes ~10 minutes. <a href="{share_url}">Start the interview</a>.</p>'
        "<p>Thanks,<br/>The telepace team</p>"
    )
    return subject, body_html, body_text


def _build_sms_body(invite_in: InviteInput, spec_title: str, share_url: str) -> str:
    intro = invite_in.personalized_intro or f"Quick research on {spec_title}"
    return f"{intro} Join in ~10 min: {share_url}"


def _build_opening_line(invite_in: InviteInput, spec_title: str) -> str:
    if invite_in.personalized_intro:
        return invite_in.personalized_intro
    name = f" {invite_in.name}" if invite_in.name else ""
    return (
        f"Hi{name}, this is telepace calling about {spec_title}. "
        "Do you have a few minutes?"
    )


@dataclass(slots=True)
class DispatchHandler:
    """Fan `DispatchInvites` out to configured adapters."""

    email: EmailDispatcher | None = None
    sms: SmsDispatcher | None = None
    phone: PhoneDispatcher | None = None
    share_url_base: str = "http://localhost:3000"

    async def run(
        self,
        command: Any,
        context: dict[str, Any],
        harness: Harness,
    ) -> AgentResult:
        _ = harness
        if not isinstance(command, DispatchInvites):
            return AgentResult(
                response={"error": f"unsupported command {type(command).__name__}"}
            )
        assert command.campaign_id is not None

        spec = self._extract_spec(context)
        spec_title = spec.get("title") or "our study"
        spec_goal = spec.get("goal") or "understand your experience"
        share_url = f"{self.share_url_base.rstrip('/')}/r/{command.campaign_id}"

        events: list[EventBase] = []
        sent = 0
        failed: list[dict[str, str]] = []

        for inv in command.invites:
            recipient_id = uuid4()
            invite = Invite(
                recipient_id=recipient_id,
                address=inv.address,
                name=inv.name,
                personalized_intro=inv.personalized_intro,
                share_url=share_url,
            )
            addr_hash = hash_address(inv.address)

            receipt = await self._dispatch_one(
                inv, invite, spec_title, spec_goal, command.campaign_id
            )

            events.append(
                InviteDispatched(
                    campaign_id=command.campaign_id,
                    actor="agent:dispatch",
                    respondent_id=recipient_id,
                    channel=inv.channel.value,
                    provider=receipt.provider,
                    provider_id=receipt.provider_id,
                    address_hash=addr_hash,
                    ok=receipt.ok,
                    error=receipt.error,
                )
            )
            if receipt.ok:
                sent += 1
            else:
                failed.append(
                    {
                        "channel": inv.channel.value,
                        "address_hash": addr_hash,
                        "error": receipt.error or "unknown",
                    }
                )

        return AgentResult(
            events=events,
            response={"sent": sent, "failed": failed},
        )

    async def _dispatch_one(
        self,
        inv: InviteInput,
        invite: Invite,
        spec_title: str,
        spec_goal: str,
        campaign_id: UUID,
    ) -> DispatchReceipt:
        _ = spec_goal  # currently only surfaced through email body
        try:
            if inv.channel == ChannelKind.EMAIL:
                if self.email is None:
                    return DispatchReceipt(
                        ok=False,
                        provider="none",
                        provider_id=None,
                        error="no email dispatcher configured",
                    )
                subject, html, text = _build_email_content(
                    inv, spec_title, spec_goal, invite.share_url
                )
                return await self.email.send(invite, subject, html, text)
            if inv.channel == ChannelKind.SMS:
                if self.sms is None:
                    return DispatchReceipt(
                        ok=False,
                        provider="none",
                        provider_id=None,
                        error="no sms dispatcher configured",
                    )
                body = _build_sms_body(inv, spec_title, invite.share_url)
                return await self.sms.send(invite, body)
            if inv.channel == ChannelKind.PHONE_OUTBOUND:
                if self.phone is None:
                    return DispatchReceipt(
                        ok=False,
                        provider="none",
                        provider_id=None,
                        error="no phone dispatcher configured",
                    )
                opening = _build_opening_line(inv, spec_title)
                return await self.phone.place_call(invite, opening, campaign_id)
            return DispatchReceipt(
                ok=False,
                provider="none",
                provider_id=None,
                error=f"unsupported channel {inv.channel.value}",
            )
        except Exception as exc:
            logger.exception(
                "dispatch failed", extra={"channel": inv.channel.value}
            )
            return DispatchReceipt(
                ok=False, provider="unknown", provider_id=None, error=str(exc)
            )

    @staticmethod
    def _extract_spec(context: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(context, dict):
            return {}
        spec = context.get("spec")
        if isinstance(spec, dict):
            return spec
        return {
            "title": context.get("title"),
            "goal": context.get("goal"),
        }
