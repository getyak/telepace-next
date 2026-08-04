from __future__ import annotations

from uuid import uuid4

import pytest

from agents.coordinator import CoordinatorAgent
from core.protocols.commands import PushInsights
from interfaces.channels.base import DispatchReceipt


class _EmailOK:
    def __init__(self) -> None:
        self.invite = None

    async def send(self, invite, subject, body_html, body_text):
        self.invite = invite
        assert subject == "Telepace research insights"
        assert invite.share_url in body_html
        assert invite.share_url in body_text
        return DispatchReceipt(
            ok=True,
            provider="mock",
            provider_id="delivery-123",
            error=None,
        )


@pytest.mark.asyncio
async def test_push_email_has_provider_reference_and_redacts_event_target() -> None:
    email = _EmailOK()
    campaign_id = uuid4()
    result = await CoordinatorAgent(
        insight_email=email,
        public_base_url="https://telepace.test",
    ).run(
        PushInsights(
            campaign_id=campaign_id,
            destination="email",
            config={"target": "researcher@example.test"},
        ),
        {},
        object(),
    )

    assert result.response == {
        "delivered": True,
        "destination": "email",
        "external_ref": "mock:delivery-123",
    }
    assert email.invite.address == "researcher@example.test"
    assert email.invite.share_url == (
        f"https://telepace.test/studies/{campaign_id}/insights"
    )
    assert len(result.events) == 1
    assert result.events[0].to != "researcher@example.test"
    assert len(result.events[0].to) == 16


@pytest.mark.asyncio
async def test_push_without_adapter_does_not_claim_delivery() -> None:
    result = await CoordinatorAgent().run(
        PushInsights(
            campaign_id=uuid4(),
            destination="notion",
            config={"target": "page-1"},
        ),
        {},
        object(),
    )

    assert result.response["delivered"] is False
    assert result.events == []


@pytest.mark.asyncio
async def test_push_email_requires_target() -> None:
    result = await CoordinatorAgent(insight_email=_EmailOK()).run(
        PushInsights(campaign_id=uuid4(), destination="email"),
        {},
        object(),
    )

    assert result.response["delivered"] is False
    assert result.events == []
