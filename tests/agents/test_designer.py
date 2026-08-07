"""DesignerAgent unit tests using MockLLM."""

from __future__ import annotations

import asyncio
import json
from typing import Any
from uuid import uuid4

from agents.designer import DesignerAgent
from agents.shared.llm import LLMMessage, LLMResponse, MockLLM
from core.domain.models import ResearchTask
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


async def test_on_create_honors_caller_supplied_campaign_id_for_idempotency() -> None:
    campaign_id = uuid4()
    agent = DesignerAgent(llm=MockLLM(), max_tokens=1500, temperature=0.3)

    result = await agent.run(
        _create(campaign_id),
        context={},
        harness=None,  # type: ignore[arg-type]
    )

    assert result.events[0].campaign_id == campaign_id
    assert result.events[1].campaign_id == campaign_id
    assert result.response["campaign_id"] == str(campaign_id)


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
            '<spec_patch>{"questions": ["Which competitors did you evaluate?"]}</spec_patch>'
        )
    )
    agent = DesignerAgent(llm=MockLLM(canned=[canned]), max_tokens=1500, temperature=0.3)
    cid = uuid4()
    refine = RefineOutline(actor="user:x", campaign_id=cid, instruction="Add competitor question.")
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


async def test_on_refine_adds_quoted_question_when_offline_model_returns_no_patch() -> None:
    agent = DesignerAgent(llm=MockLLM(), max_tokens=1500, temperature=0.3)
    cid = uuid4()
    refine = RefineOutline(
        actor="user:x",
        campaign_id=cid,
        instruction='Add the question "What makes pricing hard to understand?"',
    )
    result = await agent.run(
        refine,
        context={
            "spec": {
                "primary_language": "en",
                "outline": {
                    "items": [],
                    "estimated_duration_minutes": 10,
                    "success_criteria": [],
                },
            }
        },
        harness=None,  # type: ignore[arg-type]
    )

    assert result.response["patch"]["outline"]["items"][0]["question"] == (
        "What makes pricing hard to understand?"
    )


async def test_on_refine_handles_invalid_json_in_spec_patch() -> None:
    canned = LLMResponse(text="Broken:\n<spec_patch>{not json,,,}</spec_patch>")
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
    assert len(result.state_delta["spec"]["outline"]["items"]) == 6
    assert len(result.state_delta["spec"]["hypotheses"]) == 3
    assert result.state_delta["spec"]["target_persona"]


async def test_seed_timeout_returns_usable_fallback_without_waiting_for_model() -> None:
    class SlowLLM:
        async def complete(self, **kwargs: Any) -> LLMResponse:
            await asyncio.sleep(10)
            return LLMResponse(text="never reached")

        async def stream(self, **kwargs: Any):
            raise NotImplementedError

    agent = DesignerAgent(
        llm=SlowLLM(),  # type: ignore[arg-type]
        max_tokens=1500,
        temperature=0.3,
        seed_timeout_seconds=0.01,
    )
    loop = asyncio.get_running_loop()
    started = loop.time()

    result = await agent.run(_create(), context={}, harness=None)  # type: ignore[arg-type]

    assert loop.time() - started < 0.5
    spec = result.state_delta["spec"]
    assert len(spec["outline"]["items"]) == 6
    assert len(spec["outline"]["success_criteria"]) == 2
    assert spec["primary_language"] == "en"


async def test_refund_failure_fallback_compiles_a_release_ready_eval_contract() -> None:
    """A production failure must become a concrete regression system, not a
    generic six-question research guide when the upstream model is unavailable."""

    cmd = CreateCampaign(
        actor="user:x",
        org_id=uuid4(),
        author_id=uuid4(),
        title="Refund promise failure",
        goal="Our support agent promised a refund outside policy",
        channels=[ChannelKind.WEB_TEXT],
        research_task=ResearchTask(
            decision="Ship a new agent version to production",
            objective="Prevent unauthorized refund promises",
            audience="Company refund policy team",
        ),
    )
    agent = DesignerAgent(llm=MockLLM(), max_tokens=1500, temperature=0.3)

    result = await agent.run(cmd, context={}, harness=None)  # type: ignore[arg-type]

    spec = result.state_delta["spec"]
    plan = spec["evaluation_plan"]
    assert plan["contract"]["capability"] == (
        "Refund eligibility verification, communication, and escalation"
    )
    assert "Promise a refund before verification" in plan["contract"]["prohibited_outcomes"]
    assert plan["release_gate"]["max_critical_failures"] == 0
    assert plan["release_gate"]["requires_human_calibration"] is True
    assert [grader["kind"] for grader in plan["graders"]] == [
        "deterministic",
        "model",
        "human",
    ]
    assert len(spec["candidate_eval_cases"]) == 4
    assert spec["candidate_eval_cases"][1]["severity"] == 5
    assert spec["candidate_eval_cases"][1]["status"] == "hypothesis"
    assert all(item["evidence_target"] for item in spec["outline"]["items"])
    assert spec["outline"]["items"][0]["authority"] == "telemetry"
    assert spec["outline"]["items"][0]["decision_impact"] == 5
    assert set(plan["contract"]["critical_slices"]) <= {
        item["slice"] for item in spec["candidate_eval_cases"]
    }


async def test_account_recovery_fallback_uses_security_policy_contract() -> None:
    cmd = CreateCampaign(
        actor="user:x",
        org_id=uuid4(),
        author_id=uuid4(),
        title="Define the release bar for an account-recovery agent",
        goal="Launch account recovery without increasing takeover risk",
        channels=[ChannelKind.WEB_TEXT],
        research_task=ResearchTask(
            decision="Ship or hold the account-recovery candidate",
            objective="Recover legitimate accounts safely",
            audience="Security, policy, and support operations owners",
        ),
    )
    agent = DesignerAgent(llm=MockLLM(), max_tokens=1500, temperature=0.3)

    result = await agent.run(cmd, context={}, harness=None)  # type: ignore[arg-type]

    spec = result.state_delta["spec"]
    contract = spec["evaluation_plan"]["contract"]
    assert contract["capability"].startswith("Restore legitimate access")
    assert "compromised email" in contract["critical_slices"]
    assert "Bypass a cooldown, lock, or human approval" in contract["prohibited_outcomes"]
    assert [grader["kind"] for grader in spec["evaluation_plan"]["graders"]] == [
        "deterministic",
        "reference",
        "human",
    ]
    assert spec["outline"]["items"][0]["authority"] == "policy"
    assert spec["candidate_eval_cases"][1]["slice"] == "compromised email"
    assert set(contract["critical_slices"]) <= {
        item["slice"] for item in spec["candidate_eval_cases"]
    }


async def test_clinical_judge_fallback_compiles_blinded_holdout_calibration() -> None:
    cmd = CreateCampaign(
        actor="user:x",
        org_id=uuid4(),
        author_id=uuid4(),
        title="Calibrate a judge for clinical note summaries",
        goal="Measure agreement and blind spots against clinical experts",
        channels=[ChannelKind.WEB_TEXT],
        research_task=ResearchTask(
            decision="Approve or reject judge version j2",
            objective="Calibrate clinical-summary correctness judgments",
            audience="Clinical safety experts",
        ),
    )
    agent = DesignerAgent(llm=MockLLM(), max_tokens=1500, temperature=0.3)

    result = await agent.run(cmd, context={}, harness=None)  # type: ignore[arg-type]

    spec = result.state_delta["spec"]
    plan = spec["evaluation_plan"]
    gate = plan["release_gate"]
    assert plan["contract"]["capability"] == "Judge clinical-note summary correctness"
    assert gate["minimum_calibration_examples"] == 10
    assert gate["minimum_holdout_examples"] == 2
    assert gate["minimum_judge_agreement"] == 0.8
    assert spec["outline"]["items"][0]["answer_schema"] == "comparison"
    assert spec["candidate_eval_cases"][0]["slice"] == "critical omission"
    assert set(plan["contract"]["critical_slices"]) <= {
        item["slice"] for item in spec["candidate_eval_cases"]
    }


async def test_targeted_clarification_fallback_is_one_trace_linked_question() -> None:
    goal = (
        "After our AI checkout agent changes a delivery address, ask only the "
        "affected user a 30-second clarification linked to trace tr_123."
    )
    cmd = CreateCampaign(
        actor="user:x",
        org_id=uuid4(),
        author_id=uuid4(),
        title="Trace-triggered address clarification",
        goal=goal,
        channels=[ChannelKind.WEB_TEXT],
        target_completions=10,
        research_task=ResearchTask(
            decision="Promote a wrong address change into a regression",
            objective="Resolve intent telemetry cannot reveal",
            audience="The affected user linked to tr_123",
        ),
    )
    agent = DesignerAgent(llm=MockLLM(), max_tokens=1500, temperature=0.3)

    result = await agent.run(cmd, context={}, harness=None)  # type: ignore[arg-type]

    spec = result.state_delta["spec"]
    item = spec["outline"]["items"][0]
    assert spec["target_completions"] == 1
    assert spec["outline"]["estimated_duration_minutes"] == 1
    assert len(spec["outline"]["items"]) == 1
    assert item["evidence_target"] == "eval_case.tr_123.affected_user_intent"
    assert item["authority"] == "end_user"
    assert spec["candidate_eval_cases"][0]["title"].startswith("tr_123")
    assert spec["evaluation_plan"]["release_gate"]["requires_human_calibration"] is False
    assert set(spec["evaluation_plan"]["contract"]["critical_slices"]) <= {
        item["slice"] for item in spec["candidate_eval_cases"]
    }


async def test_seed_hard_deadline_does_not_wait_for_cancellation_cleanup() -> None:
    class CancellationResistantLLM:
        async def complete(self, **kwargs: Any) -> LLMResponse:
            try:
                await asyncio.sleep(10)
            except asyncio.CancelledError:
                # Mirrors an upstream SDK unwinding an internal retry before
                # acknowledging cancellation.
                await asyncio.sleep(0.25)
            return LLMResponse(text="too late")

        async def stream(self, **kwargs: Any):
            raise NotImplementedError

    agent = DesignerAgent(
        llm=CancellationResistantLLM(),  # type: ignore[arg-type]
        max_tokens=1500,
        temperature=0.3,
        seed_timeout_seconds=0.01,
    )
    loop = asyncio.get_running_loop()
    started = loop.time()

    result = await agent.run(_create(), context={}, harness=None)  # type: ignore[arg-type]

    assert loop.time() - started < 0.1
    assert len(result.state_delta["spec"]["outline"]["items"]) == 6


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
        refine,
        context={"spec": {"primary_language": "zh"}},
        harness=None,  # type: ignore[arg-type]
    )
    assert "LANGUAGE (already decided" in (llm.last_user_msg or "")
    assert ": zh" in (llm.last_user_msg or "")
