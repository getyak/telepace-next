"""DesignerAgent unit tests using MockLLM."""

from __future__ import annotations

from uuid import uuid4

from agents.designer import DesignerAgent
from agents.shared.llm import LLMResponse, MockLLM
from core.protocols.commands import CreateCampaign, RefineOutline
from core.protocols.mcp_tools import ChannelKind


def _create(cid=None) -> CreateCampaign:
    return CreateCampaign(
        actor="user:x",
        campaign_id=cid,
        org_id=uuid4(),
        author_id=uuid4(),
        title="Pricing study",
        goal="Learn PMM price sensitivity",
        channels=[ChannelKind.WEB_TEXT],
        budget_usd=50.0,
        target_completions=5,
    )


async def test_on_create_returns_events_and_state_delta() -> None:
    agent = DesignerAgent(llm=MockLLM(), max_tokens=1500, temperature=0.3)
    result = await agent.run(_create(), context={}, harness=None)  # type: ignore[arg-type]
    assert len(result.events) == 2
    assert result.events[0].type == "study.drafted"
    assert result.events[1].type == "study.spec_updated"
    assert result.state_delta["budget_usd"] == 50.0
    assert result.state_delta["target_completions"] == 5
    assert "spec" in result.state_delta
    assert result.response["title"] == "Pricing study"
    assert result.response["status"] == "draft"


async def test_on_refine_parses_spec_patch_from_llm_text() -> None:
    canned = LLMResponse(
        text=(
            "Sure. I'll add a competitor question.\n"
            "<spec_patch>{\"questions\": [\"Which competitors did you evaluate?\"]}</spec_patch>"
        )
    )
    agent = DesignerAgent(llm=MockLLM(canned=[canned]), max_tokens=1500, temperature=0.3)
    cid = uuid4()
    refine = RefineOutline(
        actor="user:x", campaign_id=cid, instruction="Add competitor question."
    )
    result = await agent.run(refine, context={"spec": {"title": "t"}}, harness=None)  # type: ignore[arg-type]
    assert len(result.events) == 1
    assert result.events[0].type == "study.spec_updated"
    assert result.response["patch"] == {"questions": ["Which competitors did you evaluate?"]}


async def test_on_refine_handles_missing_spec_patch_gracefully() -> None:
    canned = LLMResponse(text="I did not include a patch block.")
    agent = DesignerAgent(llm=MockLLM(canned=[canned]), max_tokens=1500, temperature=0.3)
    cid = uuid4()
    refine = RefineOutline(actor="user:x", campaign_id=cid, instruction="Ignore.")
    result = await agent.run(refine, context={"spec": {}}, harness=None)  # type: ignore[arg-type]
    assert result.response["patch"] == {}


async def test_on_refine_handles_invalid_json_in_spec_patch() -> None:
    canned = LLMResponse(
        text="Broken:\n<spec_patch>{not json,,,}</spec_patch>"
    )
    agent = DesignerAgent(llm=MockLLM(canned=[canned]), max_tokens=1500, temperature=0.3)
    refine = RefineOutline(actor="user:x", campaign_id=uuid4(), instruction="X")
    result = await agent.run(refine, context={"spec": {}}, harness=None)  # type: ignore[arg-type]
    assert result.response["patch"] == {}


async def test_run_returns_error_for_unsupported_command() -> None:
    from core.protocols.commands import StartCampaign

    agent = DesignerAgent(llm=MockLLM(), max_tokens=1500, temperature=0.3)
    r = await agent.run(StartCampaign(actor="x", campaign_id=uuid4()), {}, None)  # type: ignore[arg-type]
    assert "error" in r.response
