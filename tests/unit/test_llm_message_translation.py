from agents.shared.llm import LLMMessage, OpenRouterLLM


def test_openai_translation_preserves_tool_call_ids() -> None:
    translated = OpenRouterLLM._translate_messages(
        "system",
        [
            LLMMessage(role="user", content="create it"),
            LLMMessage(
                role="assistant",
                content=[
                    {"type": "text", "text": "Working."},
                    {
                        "type": "tool_use",
                        "id": "call-1",
                        "name": "create_campaign",
                        "input": {"title": "T"},
                    },
                ],
            ),
            LLMMessage(
                role="user",
                content=[
                    {
                        "type": "tool_result",
                        "tool_use_id": "call-1",
                        "content": '{"campaign_id":"c1"}',
                    }
                ],
            ),
        ],
    )

    assert translated[2]["tool_calls"][0]["id"] == "call-1"
    assert translated[3] == {
        "role": "tool",
        "tool_call_id": "call-1",
        "content": '{"campaign_id":"c1"}',
    }
