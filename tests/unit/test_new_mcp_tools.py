"""Unit tests for the four added MCP tool handlers.

Fakes stand in for the harness and projector so no DB/LLM is needed. Each test
verifies the command the handler builds and the output it maps back.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest

from core.domain.models import ChannelKind
from interfaces.mcp_server.tools import (
    dispatch_invites,
    list_campaigns,
    refine_outline,
    start_campaign,
)


class _HarnessResp:
    def __init__(self, ok: bool = True, result: Any = None, reason: str = "") -> None:
        self.ok = ok
        self.result = result if result is not None else {}
        self.reason = reason


class _FakeHarness:
    def __init__(self, resp: _HarnessResp) -> None:
        self._resp = resp
        self.commands: list[Any] = []

    async def handle(self, cmd: Any) -> _HarnessResp:
        self.commands.append(cmd)
        return self._resp


class _FakeProjector:
    def __init__(self, campaigns=None, campaign=None) -> None:
        self._campaigns = campaigns or []
        self._campaign = campaign

    async def list_campaigns(self, org_id):
        return self._campaigns

    async def get_campaign(self, campaign_id):
        return self._campaign


@pytest.mark.asyncio
async def test_list_campaigns_maps_rows() -> None:
    org = uuid4()
    cid = uuid4()
    rows = [
        {
            "id": str(cid),
            "title": "Onboarding",
            "status": "live",
            "target_completions": 20,
            "progress": {"completed": 7},
        }
    ]
    out = await list_campaigns({}, projector=_FakeProjector(campaigns=rows), org_id=org)

    assert len(out["campaigns"]) == 1
    c = out["campaigns"][0]
    assert c["campaign_id"] == str(cid)
    assert c["title"] == "Onboarding"
    assert c["completed"] == 7
    assert c["target_completions"] == 20


@pytest.mark.asyncio
async def test_refine_outline_builds_command() -> None:
    harness = _FakeHarness(_HarnessResp(ok=True))
    cid = uuid4()
    out = await refine_outline(
        {"campaign_id": str(cid), "instruction": "add pricing question"},
        harness=harness,
        author_id=uuid4(),
    )
    assert out["status"] == "refined"
    assert harness.commands[0].type == "refine_outline"
    assert harness.commands[0].instruction == "add pricing question"


@pytest.mark.asyncio
async def test_start_campaign_reports_dispatchable_channels() -> None:
    from types import SimpleNamespace

    from core.domain.models import Channel

    campaign = SimpleNamespace(
        spec=SimpleNamespace(
            channels=[Channel(kind=ChannelKind.EMAIL), Channel(kind=ChannelKind.WEB_TEXT)]
        )
    )

    harness = _FakeHarness(_HarnessResp(ok=True))
    out = await start_campaign(
        {"campaign_id": str(uuid4())},
        harness=harness,
        projector=_FakeProjector(campaign=campaign),
        author_id=uuid4(),
    )
    assert out["status"] == "live"
    assert out["dispatchable_channels"] == [ChannelKind.EMAIL.value]
    assert harness.commands[0].type == "start_campaign"


@pytest.mark.asyncio
async def test_dispatch_invites_builds_invites() -> None:
    harness = _FakeHarness(_HarnessResp(ok=True, result={"dispatched": 2}))
    cid = uuid4()
    out = await dispatch_invites(
        {
            "campaign_id": str(cid),
            "invites": [
                {"address": "a@x.test", "channel": ChannelKind.EMAIL.value},
                {"address": "b@x.test", "channel": ChannelKind.EMAIL.value, "name": "B"},
            ],
        },
        harness=harness,
        author_id=uuid4(),
    )
    assert out["dispatched"] == 2
    cmd = harness.commands[0]
    assert cmd.type == "dispatch_invites"
    assert len(cmd.invites) == 2


@pytest.mark.asyncio
async def test_handler_raises_on_harness_failure() -> None:
    harness = _FakeHarness(_HarnessResp(ok=False, reason="budget exceeded"))
    with pytest.raises(RuntimeError, match="budget exceeded"):
        await refine_outline(
            {"campaign_id": str(uuid4()), "instruction": "x"},
            harness=harness,
            author_id=uuid4(),
        )
