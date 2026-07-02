"""Policy unit tests: BudgetPolicy, PIIPolicy, EscalationPolicy, PolicyStack."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest

from core.protocols.commands import CreateCampaign, ReplyInInterview
from core.protocols.mcp_tools import ChannelKind
from harness.policies import BudgetPolicy, EscalationPolicy, PIIPolicy, PolicyStack
from harness.policies.base import Policy, PolicyDecision


def _reply(text: str, cid: UUID | None = None) -> ReplyInInterview:
    return ReplyInInterview(
        actor="respondent:x",
        campaign_id=cid or uuid4(),
        interview_id=uuid4(),
        text=text,
    )


def _create(cid: UUID | None = None) -> CreateCampaign:
    return CreateCampaign(
        actor="user:x",
        campaign_id=cid,
        org_id=uuid4(),
        author_id=uuid4(),
        title="T",
        goal="G",
        channels=[ChannelKind.WEB_TEXT],
    )


async def test_budget_allows_when_under_warn_ratio() -> None:
    p = BudgetPolicy(warn_ratio=0.8, hard_stop_ratio=1.0)
    d = await p.allow(_create(cid=uuid4()), {"spent_usd": 10.0, "budget_usd": 100.0})
    assert d.allowed and d.events == []


async def test_budget_emits_warning_event_at_warn_ratio() -> None:
    p = BudgetPolicy(warn_ratio=0.8, hard_stop_ratio=1.0)
    d = await p.allow(_create(cid=uuid4()), {"spent_usd": 80.0, "budget_usd": 100.0})
    assert d.allowed
    assert len(d.events) == 1
    assert d.events[0].type == "policy.budget_crossed"
    assert d.events[0].threshold == 0.8


async def test_budget_blocks_at_hard_stop_ratio() -> None:
    p = BudgetPolicy(warn_ratio=0.8, hard_stop_ratio=1.0)
    d = await p.allow(_create(cid=uuid4()), {"spent_usd": 100.0, "budget_usd": 100.0})
    assert not d.allowed
    assert "budget exhausted" in d.reason
    assert d.events[0].threshold == 1.0


async def test_budget_treats_zero_budget_as_effectively_infinite_ratio() -> None:
    p = BudgetPolicy()
    d = await p.allow(_create(cid=uuid4()), {"spent_usd": 1.0, "budget_usd": 0.0})
    assert not d.allowed


async def test_budget_skips_event_when_no_campaign_id() -> None:
    p = BudgetPolicy()
    d = await p.allow(_create(cid=None), {"spent_usd": 90.0, "budget_usd": 100.0})
    assert d.allowed
    assert d.events == []


async def test_pii_no_op_when_command_has_no_text() -> None:
    d = await PIIPolicy().allow(_create(cid=uuid4()), {})
    assert d.allowed and d.events == []


async def test_pii_redacts_email_and_emits_event() -> None:
    p = PIIPolicy()
    cmd = _reply("Contact me at alice@example.com please.", cid=uuid4())
    d = await p.allow(cmd, {})
    assert d.allowed
    assert "[email]" in cmd.text
    assert d.events[0].type == "policy.pii_redacted"
    assert "email" in d.events[0].fields


async def test_pii_redacts_phone_number() -> None:
    p = PIIPolicy()
    cmd = _reply("Call me at +1 415 555 0100.", cid=uuid4())
    d = await p.allow(cmd, {})
    assert "[phone]" in cmd.text
    assert "phone" in d.events[0].fields


async def test_pii_phone_regex_shadows_cn_id_regex() -> None:
    """Regression pin: The PHONE regex `\\+?\\d[\\d\\s\\-]{7,}\\d` also matches
    an 18-char Chinese ID number, and it runs BEFORE the CN_ID regex, so in
    practice CN ids are surfaced as phone redactions and the cn_id branch is
    unreachable. Fixing this is a deliberate change; this test locks the
    current behaviour so it is not a silent regression."""
    from harness.policies.pii import redact

    cleaned, fields = redact("11010119900101101X")
    assert "[phone]" in cleaned
    assert fields == ["phone"]


async def test_pii_emits_no_event_when_text_is_clean() -> None:
    p = PIIPolicy()
    d = await p.allow(_reply("nothing sensitive here", cid=uuid4()), {})
    assert d.allowed and d.events == []


async def test_escalation_no_op_when_no_text() -> None:
    d = await EscalationPolicy().allow(_create(cid=uuid4()), {})
    assert d.allowed and d.events == []


@pytest.mark.parametrize(
    "text",
    ["I want a refund now.", "This is a scam.", "I will lawsuit you."],
)
async def test_escalation_high_severity_signals(text: str) -> None:
    d = await EscalationPolicy().allow(_reply(text, cid=uuid4()), {})
    assert d.allowed
    assert d.events[0].severity == "high"


@pytest.mark.parametrize("text", ["I am disappointed.", "I feel frustrated"])
async def test_escalation_medium_severity_signals(text: str) -> None:
    d = await EscalationPolicy().allow(_reply(text, cid=uuid4()), {})
    assert d.events[0].severity == "medium"


async def test_escalation_chinese_keywords_not_matched_by_word_boundary() -> None:
    """Known limitation: \\b does not detect word boundaries around CJK glyphs,
    so the CJK entries in the escalation regexes are effectively unreachable
    unless surrounded by ASCII whitespace/punctuation the regex engine treats
    as a boundary. This test locks that behaviour so a fix is a deliberate
    breaking change rather than a silent regression."""
    d = await EscalationPolicy().allow(_reply("很失望", cid=uuid4()), {})
    assert d.events == []
    d2 = await EscalationPolicy().allow(_reply("投诉你们客服", cid=uuid4()), {})
    assert d2.events == []


async def test_escalation_ignores_neutral_text() -> None:
    d = await EscalationPolicy().allow(_reply("all good, thanks!", cid=uuid4()), {})
    assert d.events == []


class _AlwaysAllow(Policy):
    name = "always_allow"

    async def allow(self, command: Any, context: dict[str, Any]) -> PolicyDecision:
        return PolicyDecision(allowed=True)


class _AlwaysDeny(Policy):
    name = "always_deny"

    async def allow(self, command: Any, context: dict[str, Any]) -> PolicyDecision:
        return PolicyDecision(allowed=False, reason="denied for test")


async def test_stack_returns_allowed_when_all_allow() -> None:
    d = await PolicyStack([_AlwaysAllow(), _AlwaysAllow()]).allow_all(_create(), {})
    assert d.allowed


async def test_stack_short_circuits_on_first_deny() -> None:
    d = await PolicyStack([_AlwaysAllow(), _AlwaysDeny(), _AlwaysAllow()]).allow_all(_create(), {})
    assert not d.allowed
    assert "always_deny" in d.reason


async def test_stack_accumulates_events_up_to_denial() -> None:
    p = BudgetPolicy(warn_ratio=0.5, hard_stop_ratio=1.0)
    stack = PolicyStack([p, _AlwaysDeny()])
    d = await stack.allow_all(
        _create(cid=uuid4()),
        {"spent_usd": 80.0, "budget_usd": 100.0},
    )
    assert not d.allowed
    assert any(e.type == "policy.budget_crossed" for e in d.events)


async def test_stack_observe_all_aggregates_from_all_policies() -> None:
    out = await PolicyStack([_AlwaysAllow(), _AlwaysAllow()]).observe_all(object())
    assert out == []
