"""Task-assessment gate unit tests (no LLM involved).

Covers the pure helpers behind POST /v1/campaigns/assess — the pre-creation
readiness gate that decides whether a researcher's intent is clear enough to
draft a study, and clarifies first when it is not.
"""

from __future__ import annotations

from interfaces.rest_api.routers.campaigns import (
    _assess_fallback,
    _clean_clarify_questions,
    _parse_assessment,
)


class TestAssessFallback:
    """The deterministic gate used when no real LLM is available."""

    def test_substantive_research_goal_is_ready(self) -> None:
        r = _assess_fallback("understand why trial users churn", "")
        assert r["looks_like_research"] is True
        assert r["ready"] is True
        assert r["objective"] == "understand why trial users churn"

    def test_chinese_research_goal_is_ready(self) -> None:
        r = _assess_fallback("了解用户为什么在升级前流失", "")
        assert r["looks_like_research"] is True
        assert r["ready"] is True

    def test_greeting_is_not_research(self) -> None:
        r = _assess_fallback("hi there", "")
        assert r["looks_like_research"] is False
        assert r["ready"] is False
        assert r["objective"] == ""

    def test_speech_script_is_not_research(self) -> None:
        # A pasted culture-event blurb is NOT a research need — the exact
        # fire-first trap the gate exists to stop.
        r = _assess_fallback("南疆留诗韵八桂风华中华优秀传统文化海外推介交流活动", "")
        assert r["looks_like_research"] is False
        assert r["ready"] is False

    def test_prior_context_tips_a_bare_topic_into_ready(self) -> None:
        r = _assess_fallback("monitors", "understand buyer decisions")
        assert r["looks_like_research"] is True
        assert r["ready"] is True


class TestParseAssessment:
    """Parsing the LLM verdict, with the authoritative server-side ready rule."""

    def test_ready_requires_decision_objective_and_clarity(self) -> None:
        text = """```json
        {"looks_like_research": true, "clarity_score": 80,
         "decision": "whether to ship new onboarding",
         "objective": "understand old-user churn drivers",
         "audience": "churned paying users", "missing": [],
         "suggested_title": "Onboarding churn", "clarifying_questions": []}
        ```"""
        r = _parse_assessment(text, goal="g", prior_context="")
        assert r["ready"] is True
        assert r["decision"] == "whether to ship new onboarding"
        assert r["clarifying_questions"] == []

    def test_not_ready_when_decision_missing_even_if_high_clarity(self) -> None:
        text = """```json
        {"looks_like_research": true, "clarity_score": 90,
         "decision": "", "objective": "understand churn",
         "audience": "", "missing": ["decision"],
         "suggested_title": "Churn",
         "clarifying_questions": [
           {"id": "q1", "prompt": "What decision?", "multi": false,
            "options": [{"id": "a", "label": "Pricing"}],
            "allow_freeform": true}]}
        ```"""
        r = _parse_assessment(text, goal="g", prior_context="")
        assert r["ready"] is False
        # Clarifying questions survive only while NOT ready.
        assert len(r["clarifying_questions"]) == 1

    def test_low_clarity_gates_even_with_decision(self) -> None:
        text = """```json
        {"looks_like_research": true, "clarity_score": 40,
         "decision": "d", "objective": "o", "audience": "a",
         "missing": [], "suggested_title": "t", "clarifying_questions": []}
        ```"""
        r = _parse_assessment(text, goal="g", prior_context="")
        assert r["ready"] is False

    def test_garbage_falls_back_to_deterministic(self) -> None:
        r = _parse_assessment("not json at all", goal="understand user churn", prior_context="")
        # Falls back to the rule-based gate, which finds this research-shaped.
        assert r["looks_like_research"] is True
        assert r["ready"] is True

    def test_suggested_title_defaults_to_goal_prefix(self) -> None:
        text = """```json
        {"looks_like_research": true, "clarity_score": 80,
         "decision": "d", "objective": "o", "audience": "a",
         "missing": [], "suggested_title": "", "clarifying_questions": []}
        ```"""
        r = _parse_assessment(text, goal="my research goal here", prior_context="")
        assert r["suggested_title"] == "my research goal here"


class TestCleanClarifyQuestions:
    def test_caps_at_two_questions(self) -> None:
        raw = [
            {"id": f"q{i}", "prompt": f"p{i}", "options": [{"id": "a", "label": "A"}]}
            for i in range(5)
        ]
        assert len(_clean_clarify_questions(raw)) == 2

    def test_caps_options_at_four_and_always_allows_freeform(self) -> None:
        raw = [
            {
                "id": "q1",
                "prompt": "pick",
                "options": [{"id": str(i), "label": f"opt{i}"} for i in range(8)],
            }
        ]
        out = _clean_clarify_questions(raw)
        assert len(out) == 1
        assert len(out[0]["options"]) == 4
        assert out[0]["allow_freeform"] is True

    def test_drops_questions_without_a_prompt(self) -> None:
        raw = [{"id": "q1", "options": [{"id": "a", "label": "A"}]}]
        assert _clean_clarify_questions(raw) == []

    def test_non_list_yields_empty(self) -> None:
        assert _clean_clarify_questions("nope") == []
        assert _clean_clarify_questions(None) == []
