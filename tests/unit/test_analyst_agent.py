from __future__ import annotations

import json
from uuid import uuid4

import pytest

from agents.analyst.main import (
    AnalystAgent,
    TranscriptView,
    _has_valid_insights_shape,
    _parse_insights_payload,
)
from agents.shared.llm import LLMResponse


def _payload(label: str = "可验证的产品证据") -> dict:
    return {
        "themes": [
            {
                "label": label,
                "description": "访客更信任可以直接验证的产品。",
                "support_interview_ids": ["interview-1"],
                "confidence": 0.9,
            }
        ],
        "verbatims": [],
        "concerns": [],
        "persona": None,
    }


class _SequenceLLM:
    def __init__(self, responses: list[str]) -> None:
        self.responses = responses
        self.calls = []

    async def complete(self, **kwargs):
        self.calls.append(kwargs)
        text = self.responses[min(len(self.calls) - 1, len(self.responses) - 1)]
        return LLMResponse(text=text)


@pytest.mark.parametrize(
    "text",
    [
        "<insights>{}</insights>",
        "```json\n{}\n```",
        '```json\n{"themes":[{"label":"nested"}]}\n```',
        "Here is the result: {}",
    ],
)
def test_parse_insights_payload_accepts_provider_safe_json_formats(text: str) -> None:
    assert _parse_insights_payload(text) is not None


def test_parse_insights_payload_rejects_invalid_text() -> None:
    assert _parse_insights_payload("analysis unavailable") is None


def test_parse_insights_payload_prefers_the_contract_block() -> None:
    text = 'Example: {"themes": []}\n<insights>{"themes":[{"label":"real"}]}</insights>'

    assert _parse_insights_payload(text) == {"themes": [{"label": "real"}]}


@pytest.mark.parametrize(
    "payload",
    [
        {"themes": "none"},
        {"verbatims": [1]},
        {"concerns": [{"confidence": "high"}]},
        {"themes": [{"confidence": float("nan")}]},
        {"persona": "everyone"},
    ],
)
def test_insights_shape_rejects_values_that_cannot_be_projected(payload: dict) -> None:
    assert _has_valid_insights_shape(payload) is False


@pytest.mark.asyncio
async def test_analyst_repairs_an_unparseable_first_response() -> None:
    payload = _payload()
    llm = _SequenceLLM(
        [
            "I found a strong theme but omitted the required JSON.",
            f"<insights>{json.dumps(payload, ensure_ascii=False)}</insights>",
        ]
    )
    agent = AnalystAgent(llm=llm, max_tokens=1000, temperature=0.3)

    result = await agent.synthesize(
        campaign_id=uuid4(),
        transcripts=[
            TranscriptView(
                interview_id=uuid4(),
                turns=[{"role": "respondent", "text": "真实产品链接让我更信任。"}],
            )
        ],
        language="zh",
    )

    assert len(llm.calls) == 2
    assert llm.calls[1]["temperature"] == 0.0
    assert result.themes == payload["themes"]
    assert len(result.events) == 1
    assert result.events[0].title == "可验证的产品证据"


@pytest.mark.asyncio
async def test_analyst_repairs_parseable_but_malformed_json() -> None:
    payload = _payload("闭环反馈")
    llm = _SequenceLLM(
        [
            '<insights>{"themes":"none","concerns":[{"confidence":"high"}]}</insights>',
            f"<insights>{json.dumps(payload, ensure_ascii=False)}</insights>",
        ]
    )
    agent = AnalystAgent(llm=llm, max_tokens=1000, temperature=0.3)

    result = await agent.synthesize(
        campaign_id=uuid4(),
        transcripts=[TranscriptView(interview_id=uuid4(), turns=[])],
    )

    assert len(llm.calls) == 2
    assert result.themes == payload["themes"]
    assert result.events[0].title == "闭环反馈"


@pytest.mark.asyncio
async def test_analyst_does_not_retry_valid_empty_insights() -> None:
    llm = _SequenceLLM(
        ['<insights>{"themes":[],"verbatims":[],"concerns":[],"persona":null}</insights>']
    )
    agent = AnalystAgent(llm=llm, max_tokens=1000, temperature=0.3)

    result = await agent.synthesize(
        campaign_id=uuid4(),
        transcripts=[TranscriptView(interview_id=uuid4(), turns=[])],
    )

    assert len(llm.calls) == 1
    assert result.events == []


@pytest.mark.asyncio
async def test_analyst_drops_quotes_not_present_in_respondent_turns() -> None:
    interview_id = uuid4()
    payload = {
        "themes": [],
        "verbatims": [
            {
                "quote": "This exact quote is grounded.",
                "interview_id": str(interview_id),
                "theme_label": "Trust",
                "confidence": 0.9,
            },
            {
                "quote": "The model invented this.",
                "interview_id": str(interview_id),
                "theme_label": "Trust",
                "confidence": 0.9,
            },
        ],
        "concerns": [],
        "persona": None,
    }
    llm = _SequenceLLM(
        [f"<insights>{json.dumps(payload, ensure_ascii=False)}</insights>"]
    )
    agent = AnalystAgent(llm=llm, max_tokens=1000, temperature=0.3)

    result = await agent.synthesize(
        campaign_id=uuid4(),
        transcripts=[
            TranscriptView(
                interview_id=interview_id,
                turns=[
                    {"role": "interviewer", "text": "What happened?"},
                    {
                        "role": "respondent",
                        "text": "This exact quote is grounded.",
                    },
                ],
            )
        ],
    )

    assert [item["quote"] for item in result.verbatims] == [
        "This exact quote is grounded."
    ]
    assert len(result.events) == 1
