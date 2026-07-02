"""IntentRouter unit tests."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

import pytest

from harness.router import IntentRouter


@dataclass
class _Cmd:
    type: str


@pytest.mark.parametrize(
    "cmd_type,expected_agent",
    [
        ("create_campaign", "designer"),
        ("refine_outline", "designer"),
        ("register_respondents", "coordinator"),
        ("start_campaign", "coordinator"),
        ("reply_in_interview", "interviewer"),
        ("push_insights", "coordinator"),
        ("dispatch_invites", "dispatch"),
    ],
)
def test_router_maps_known_command_types(cmd_type: str, expected_agent: str) -> None:
    r = IntentRouter()
    assert r.route(_Cmd(type=cmd_type)) == expected_agent


def test_router_rejects_unknown_command_type() -> None:
    r = IntentRouter()
    with pytest.raises(ValueError, match="no agent registered"):
        r.route(_Cmd(type="does_not_exist"))


def test_router_rejects_command_without_type_attribute() -> None:
    r = IntentRouter()

    class Bare:
        pass

    with pytest.raises(ValueError, match="missing 'type'"):
        r.route(Bare())


def test_router_ignores_context_argument() -> None:
    r = IntentRouter()
    ctx = {"campaign_id": uuid4(), "spent_usd": 42.0}
    assert r.route(_Cmd(type="create_campaign"), ctx) == "designer"
