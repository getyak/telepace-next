"""MCP tool handlers unit tests.

Each handler is called directly with fake dependencies. Verifies:
  - input parsing (pydantic)
  - dependency invocation
  - output shape matches MCP_TOOL_REGISTRY output schema"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest

from core.protocols.mcp_tools import (
    MCP_TOOL_REGISTRY,
    ChannelKind,
    CreateCampaignOutput,
    GetCampaignInsightsOutput,
    GetCampaignProgressOutput,
    PushInsightsOutput,
)
from interfaces.mcp_server.tools import (
    TOOL_HANDLERS,
    ask_followup,
    create_campaign,
    get_campaign_insights,
    get_campaign_progress,
    push_insights,
)


def test_registry_and_handlers_align_key_for_key() -> None:
    assert set(MCP_TOOL_REGISTRY.keys()) == set(TOOL_HANDLERS.keys())


@pytest.mark.parametrize("tool_name", list(MCP_TOOL_REGISTRY.keys()))
def test_registry_input_schema_is_valid_json_schema(tool_name: str) -> None:
    input_cls, output_cls, desc = MCP_TOOL_REGISTRY[tool_name]
    schema = input_cls.model_json_schema()
    assert isinstance(schema, dict)
    assert schema.get("type") == "object"
    assert isinstance(desc, str) and desc


class _FakeHarnessOK:
    def __init__(self, result: dict[str, Any]) -> None:
        self._result = result

    async def handle(self, cmd: Any) -> Any:
        class R:
            ok = True
            reason = ""

            def __init__(self, result):
                self.result = result

        return R(self._result)


class _FakeHarnessFail:
    async def handle(self, cmd: Any) -> Any:
        class R:
            ok = False
            reason = "policy blocked"
            result = None

        return R()


async def test_create_campaign_happy_path_returns_share_url() -> None:
    cid = uuid4()
    harness = _FakeHarnessOK(result={"campaign_id": str(cid), "status": "draft"})
    out = await create_campaign(
        {"title": "T", "goal": "learn", "channels": ["web_text"]},
        harness=harness,
        org_id=uuid4(),
        author_id=uuid4(),
        public_base_url="https://x.example",
    )
    parsed = CreateCampaignOutput.model_validate(out)
    assert parsed.campaign_id == cid
    assert parsed.share_url == f"https://x.example/r/{cid}"
    assert parsed.status == "draft"
    assert len(parsed.next_actions) >= 1


async def test_create_campaign_raises_when_harness_denies() -> None:
    harness = _FakeHarnessFail()
    with pytest.raises(RuntimeError, match="create_campaign failed"):
        await create_campaign(
            {"title": "T", "goal": "learn", "channels": ["web_text"]},
            harness=harness,
            org_id=uuid4(),
            author_id=uuid4(),
            public_base_url="https://x",
        )


async def test_create_campaign_strips_trailing_slash_from_base_url() -> None:
    cid = uuid4()
    harness = _FakeHarnessOK(result={"campaign_id": str(cid), "status": "draft"})
    out = await create_campaign(
        {"title": "T", "goal": "l", "channels": [ChannelKind.WEB_TEXT.value]},
        harness=harness,
        org_id=uuid4(),
        author_id=uuid4(),
        public_base_url="https://x.example/",
    )
    assert out["share_url"] == f"https://x.example/r/{cid}"


class _FakeCampaign:
    def __init__(self, status: str = "running", budget_usd: float = 100.0) -> None:
        class Status:
            def __init__(self, v):
                self.value = v

        self.status = Status(status)

        class Spec:
            def __init__(self, b):
                self.budget_usd = b

        self.spec = Spec(budget_usd)


class _FakeSnap:
    invited = 10
    started = 5
    completed = 3
    abandoned = 1
    avg_duration_seconds = 300.0
    avg_goal_coverage = 0.75
    spent_usd = 42.0


class _FakeProjector:
    def __init__(self, campaign: _FakeCampaign | None) -> None:
        self._c = campaign

    async def get_campaign(self, cid):
        return self._c

    async def get_progress(self, cid):
        return _FakeSnap()


async def test_get_campaign_progress_happy_path() -> None:
    cid = uuid4()
    out = await get_campaign_progress(
        {"campaign_id": str(cid)},
        projector=_FakeProjector(_FakeCampaign()),
    )
    parsed = GetCampaignProgressOutput.model_validate(out)
    assert parsed.campaign_id == cid
    assert parsed.status == "running"
    assert parsed.completed == 3
    assert parsed.spent_usd == 42.0
    assert parsed.budget_usd == 100.0


async def test_get_campaign_progress_raises_when_campaign_missing() -> None:
    with pytest.raises(RuntimeError, match="not found"):
        await get_campaign_progress(
            {"campaign_id": str(uuid4())},
            projector=_FakeProjector(None),
        )


class _FakeInsightReader:
    def __init__(self, items):
        self._items = items

    async def list_insights(self, campaign_id, format, min_confidence):
        return self._items


async def test_get_campaign_insights_returns_empty_by_default() -> None:
    out = await get_campaign_insights(
        {"campaign_id": str(uuid4()), "format": "themes"},
        insight_reader=_FakeInsightReader([]),
    )
    parsed = GetCampaignInsightsOutput.model_validate(out)
    assert parsed.items == []
    assert parsed.format == "themes"


async def test_get_campaign_insights_maps_items() -> None:
    interview_id = uuid4()
    out = await get_campaign_insights(
        {"campaign_id": str(uuid4()), "format": "verbatims", "min_confidence": 0.5},
        insight_reader=_FakeInsightReader(
            [
                {
                    "id": str(uuid4()),
                    "kind": "verbatim",
                    "title": "quote",
                    "body": "…",
                    "confidence": 0.9,
                    "supporting_interview_ids": [str(interview_id)],
                }
            ]
        ),
    )
    parsed = GetCampaignInsightsOutput.model_validate(out)
    assert len(parsed.items) == 1
    assert parsed.items[0].kind == "verbatim"
    assert parsed.items[0].supporting_interview_ids == [interview_id]


class _FakeFollowup:
    def __init__(self, out):
        self._out = out

    async def answer(self, campaign_id, question, scope):
        return self._out


async def test_ask_followup_returns_answer_and_evidence() -> None:
    out = await ask_followup(
        {"campaign_id": str(uuid4()), "question": "top complaint?"},
        followup_service=_FakeFollowup(
            {
                "answer": "confusing pricing",
                "evidence": [{"interview_id": str(uuid4()), "quote": "..."}],
            }
        ),
    )
    assert out["answer"] == "confusing pricing"
    assert len(out["evidence"]) == 1


async def test_ask_followup_tolerates_missing_evidence_field() -> None:
    out = await ask_followup(
        {"campaign_id": str(uuid4()), "question": "?"},
        followup_service=_FakeFollowup({"answer": "unknown"}),
    )
    assert out["evidence"] == []


async def test_push_insights_happy_path_returns_delivered_true() -> None:
    harness = _FakeHarnessOK(result={"delivered": True, "external_ref": "notion:abc"})
    out = await push_insights(
        {"campaign_id": str(uuid4()), "destination": "notion", "config": {"page_id": "x"}},
        harness=harness,
        author_id=uuid4(),
    )
    parsed = PushInsightsOutput.model_validate(out)
    assert parsed.delivered is True
    assert parsed.external_ref == "notion:abc"


async def test_push_insights_defaults_delivered_false_when_missing() -> None:
    harness = _FakeHarnessOK(result={})
    out = await push_insights(
        {"campaign_id": str(uuid4()), "destination": "slack"},
        harness=harness,
        author_id=uuid4(),
    )
    assert out["delivered"] is False
    assert out["external_ref"] is None


async def test_push_insights_raises_when_harness_denies() -> None:
    harness = _FakeHarnessFail()
    with pytest.raises(RuntimeError, match="push_insights failed"):
        await push_insights(
            {"campaign_id": str(uuid4()), "destination": "webhook"},
            harness=harness,
            author_id=uuid4(),
        )


async def test_create_campaign_rejects_missing_required_fields() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        await create_campaign(
            {},
            harness=_FakeHarnessFail(),
            org_id=uuid4(),
            author_id=uuid4(),
            public_base_url="http://x",
        )


async def test_get_campaign_progress_rejects_missing_campaign_id() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        await get_campaign_progress({}, projector=_FakeProjector(None))


async def test_get_campaign_insights_rejects_missing_campaign_id() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        await get_campaign_insights({}, insight_reader=_FakeInsightReader([]))


async def test_ask_followup_rejects_missing_fields() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        await ask_followup({}, followup_service=_FakeFollowup({"answer": ""}))


async def test_push_insights_rejects_missing_fields() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        await push_insights({}, harness=_FakeHarnessFail(), author_id=uuid4())
