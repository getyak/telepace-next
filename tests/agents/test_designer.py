"""DesignerAgent unit tests using MockLLM."""

from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

from agents.designer import DesignerAgent
from agents.shared.llm import LLMMessage, LLMResponse, MockLLM
from core.protocols.commands import CreateCampaign, RefineOutline
from core.protocols.mcp_tools import ChannelKind


class RecordingLLM:
    """MockLLM variant that records the last prompt sent, for asserting on
    language-directive injection without needing a real model."""

    def __init__(self, canned: list[LLMResponse] | None = None) -> None:
        self._canned = canned or []
        self._idx = 0
        self.last_user_msg: str | None = None

    async def complete(
        self,
        *,
        system: str,
        messages: list[LLMMessage],
        tools: Any = None,
        model: str | None = None,
        max_tokens: int = 0,
        temperature: float = 0.0,
    ) -> LLMResponse:
        _ = system, tools, model, max_tokens, temperature
        self.last_user_msg = messages[0].content
        if not self._canned:
            return LLMResponse(text="ok")
        resp = self._canned[min(self._idx, len(self._canned) - 1)]
        self._idx += 1
        return resp

    async def stream(self, **kwargs: Any):  # pragma: no cover - unused here
        raise NotImplementedError


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


async def test_on_create_threads_respondent_experience_fields_into_spec() -> None:
    """T-111: welcome/consent/end/reward/redirect must survive create -> spec."""
    agent = DesignerAgent(llm=MockLLM(), max_tokens=1500, temperature=0.3)
    cmd = CreateCampaign(
        actor="user:x",
        org_id=uuid4(),
        author_id=uuid4(),
        title="Pricing study",
        goal="Learn PMM price sensitivity",
        channels=[ChannelKind.WEB_TEXT],
        welcome_message="Welcome!",
        consent_text="I agree to be recorded.",
        end_message="Thanks for your time.",
        reward_description="$20 gift card",
        redirect_url="https://example.com/thanks",
    )
    result = await agent.run(cmd, context={}, harness=None)  # type: ignore[arg-type]
    spec_delta = result.state_delta["spec"]
    assert spec_delta["welcome_message"] == "Welcome!"
    assert spec_delta["consent_text"] == "I agree to be recorded."
    assert spec_delta["end_message"] == "Thanks for your time."
    assert spec_delta["reward_description"] == "$20 gift card"
    assert spec_delta["redirect_url"] == "https://example.com/thanks"


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


def _create_zh(cid=None) -> CreateCampaign:
    return CreateCampaign(
        actor="user:x",
        campaign_id=cid,
        org_id=uuid4(),
        author_id=uuid4(),
        title="定价调研",
        goal="了解中型电商团队对定价套餐的敏感度",
        channels=[ChannelKind.WEB_TEXT],
        budget_usd=50.0,
        target_completions=5,
        primary_language="zh",
    )


async def test_explicit_language_overrides_llm_inference() -> None:
    """An explicit primary_language wins even if the LLM's seed infers "en"."""
    seed_json = json.dumps(
        {
            "hypotheses": ["h1"],
            "target_persona": "p",
            "audience_screener": ["s"],
            "outline": [],
            "success_criteria": [],
            "estimated_duration_minutes": 10,
            "languages": ["en"],
            "recommendations": [],
        }
    )
    llm = RecordingLLM(canned=[LLMResponse(text=f"```json\n{seed_json}\n```")])
    agent = DesignerAgent(llm=llm, max_tokens=1500, temperature=0.3)
    result = await agent.run(_create_zh(), context={}, harness=None)  # type: ignore[arg-type]
    assert result.state_delta["spec"]["primary_language"] == "zh"
    assert "LANGUAGE IS ALREADY DECIDED: zh" in (llm.last_user_msg or "")


async def test_explicit_language_survives_llm_failure() -> None:
    """Explicit language must land even if the LLM call raises."""

    class FailingLLM:
        async def complete(self, **kwargs: Any) -> LLMResponse:
            raise RuntimeError("boom")

        async def stream(self, **kwargs: Any):
            raise NotImplementedError

    agent = DesignerAgent(llm=FailingLLM(), max_tokens=1500, temperature=0.3)  # type: ignore[arg-type]
    result = await agent.run(_create_zh(), context={}, harness=None)  # type: ignore[arg-type]
    assert result.state_delta["spec"]["primary_language"] == "zh"


async def test_inferred_language_bootstraps_primary_language() -> None:
    """No explicit language: primary_language is seeded from languages[0]."""
    seed_json = json.dumps(
        {
            "hypotheses": [],
            "target_persona": "",
            "audience_screener": [],
            "outline": [],
            "success_criteria": [],
            "estimated_duration_minutes": 10,
            "languages": ["zh", "en"],
            "recommendations": [],
        }
    )
    llm = RecordingLLM(canned=[LLMResponse(text=f"```json\n{seed_json}\n```")])
    agent = DesignerAgent(llm=llm, max_tokens=1500, temperature=0.3)
    result = await agent.run(_create(), context={}, harness=None)  # type: ignore[arg-type]
    assert result.state_delta["spec"]["primary_language"] == "zh"
    assert "LANGUAGE IS ALREADY DECIDED" not in (llm.last_user_msg or "")


async def test_refine_injects_language_constraint_from_persisted_spec() -> None:
    """Refine must read primary_language back from context, not re-infer it."""
    llm = RecordingLLM(canned=[LLMResponse(text="ok")])
    agent = DesignerAgent(llm=llm, max_tokens=1500, temperature=0.3)
    refine = RefineOutline(
        actor="user:x", campaign_id=uuid4(), instruction="Add a pricing question."
    )
    await agent.run(
        refine, context={"spec": {"primary_language": "zh"}}, harness=None  # type: ignore[arg-type]
    )
    assert "LANGUAGE (already decided" in (llm.last_user_msg or "")
    assert ": zh" in (llm.last_user_msg or "")
