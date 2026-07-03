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

from core.constants import (
    BRAND_SIGNATURE,
    DEFAULT_OUTLINE_DURATION_MIN,
    DISPATCH_EMAIL_BODY_HTML_TPL,
    DISPATCH_EMAIL_BODY_TEXT_TPL,
    DISPATCH_EMAIL_GREETING_ANON,
    DISPATCH_EMAIL_GREETING_NAMED_TPL,
    DISPATCH_EMAIL_INTRO_FALLBACK_TPL,
    DISPATCH_EMAIL_SUBJECT_TPL,
    DISPATCH_PHONE_OPENING_TPL,
    DISPATCH_SMS_BODY_TPL,
    DISPATCH_SMS_INTRO_FALLBACK_TPL,
    PII_HASH_HEX_LEN,
    PRODUCT_NAME,
)
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

    return hashlib.sha256(address.encode("utf-8")).hexdigest()[:PII_HASH_HEX_LEN]


def _build_email_content(
    invite_in: InviteInput,
    spec_title: str,
    spec_goal: str,
    share_url: str,
    duration_min: int,
) -> tuple[str, str, str]:
    subject = DISPATCH_EMAIL_SUBJECT_TPL.format(spec_title=spec_title)
    greeting = (
        DISPATCH_EMAIL_GREETING_NAMED_TPL.format(name=invite_in.name)
        if invite_in.name
        else DISPATCH_EMAIL_GREETING_ANON
    )
    intro = invite_in.personalized_intro or DISPATCH_EMAIL_INTRO_FALLBACK_TPL.format(
        spec_goal=spec_goal
    )
    body_text = DISPATCH_EMAIL_BODY_TEXT_TPL.format(
        greeting=greeting,
        intro=intro,
        duration_min=duration_min,
        share_url=share_url,
        brand_signature=BRAND_SIGNATURE,
    )
    body_html = DISPATCH_EMAIL_BODY_HTML_TPL.format(
        greeting=greeting,
        intro=intro,
        duration_min=duration_min,
        share_url=share_url,
        brand_signature=BRAND_SIGNATURE,
    )
    return subject, body_html, body_text


def _build_sms_body(
    invite_in: InviteInput, spec_title: str, share_url: str, duration_min: int
) -> str:
    intro = invite_in.personalized_intro or DISPATCH_SMS_INTRO_FALLBACK_TPL.format(
        spec_title=spec_title
    )
    return DISPATCH_SMS_BODY_TPL.format(
        intro=intro, duration_min=duration_min, share_url=share_url
    )


def _build_opening_line(invite_in: InviteInput, spec_title: str) -> str:
    if invite_in.personalized_intro:
        return invite_in.personalized_intro
    name_suffix = f" {invite_in.name}" if invite_in.name else ""
    return DISPATCH_PHONE_OPENING_TPL.format(
        name_suffix=name_suffix, brand=PRODUCT_NAME, spec_title=spec_title
    )


@dataclass(slots=True)
class DispatchHandler:
    """Fan `DispatchInvites` out to configured adapters."""

    email: EmailDispatcher | None = None
    sms: SmsDispatcher | None = None
    phone: PhoneDispatcher | None = None
    share_url_base: str = ""
    actor_prefix_agent: str = "agent"
    outline_duration_min: int = DEFAULT_OUTLINE_DURATION_MIN

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
        spec_title = spec.get("title") or DISPATCH_SPEC_TITLE_FALLBACK
        spec_goal = spec.get("goal") or DISPATCH_SPEC_GOAL_FALLBACK
        share_url = (
            f"{self.share_url_base.rstrip('/')}{RESPONDENT_PATH_PREFIX}{command.campaign_id}"
        )

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
                    actor=f"{self.actor_prefix_agent}:dispatch",
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
                        error=ErrorMessages.NO_EMAIL_DISPATCHER,
                    )
                subject, html, text = _build_email_content(
                    inv, spec_title, spec_goal, invite.share_url, self.outline_duration_min
                )
                return await self.email.send(invite, subject, html, text)
            if inv.channel == ChannelKind.SMS:
                if self.sms is None:
                    return DispatchReceipt(
                        ok=False,
                        provider="none",
                        provider_id=None,
                        error=ErrorMessages.NO_SMS_DISPATCHER,
                    )
                body = _build_sms_body(
                    inv, spec_title, invite.share_url, self.outline_duration_min
                )
                return await self.sms.send(invite, body)
            if inv.channel == ChannelKind.PHONE_OUTBOUND:
                if self.phone is None:
                    return DispatchReceipt(
                        ok=False,
                        provider="none",
                        provider_id=None,
                        error=ErrorMessages.NO_PHONE_DISPATCHER,
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
