"""LLM client abstraction. Anthropic Claude primary, mock for tests."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Literal, Protocol

from core.constants import DEFAULT_LLM_MAX_TOKENS, DEFAULT_LLM_TEMPERATURE


@dataclass(slots=True)
class LLMMessage:
    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass(slots=True)
class LLMToolCall:
    name: str
    arguments: dict[str, Any]


@dataclass(slots=True)
class LLMResponse:
    text: str = ""
    tool_calls: list[LLMToolCall] | None = None
    usage_input_tokens: int = 0
    usage_output_tokens: int = 0
    stop_reason: str = ""


@dataclass(slots=True)
class StreamChunk:
    """A single delta from an LLM stream.

    kind = "text": a text delta (populate `text`).
    kind = "tool_use": a completed tool call (populate `tool_name`, `tool_input`).
    kind = "stop": end-of-stream marker (all fields may be None).
    """

    kind: Literal["text", "tool_use", "stop"]
    text: str | None = None
    tool_name: str | None = None
    tool_input: dict[str, Any] | None = None


class LLMClient(Protocol):
    async def complete(
        self,
        *,
        system: str,
        messages: list[LLMMessage],
        tools: list[dict[str, Any]] | None = None,
        model: str | None = None,
        max_tokens: int = DEFAULT_LLM_MAX_TOKENS,
        temperature: float = DEFAULT_LLM_TEMPERATURE,
    ) -> LLMResponse: ...

    def stream(
        self,
        *,
        system: str,
        messages: list[LLMMessage],
        tools: list[dict[str, Any]] | None = None,
        model: str | None = None,
        max_tokens: int = DEFAULT_LLM_MAX_TOKENS,
        temperature: float = DEFAULT_LLM_TEMPERATURE,
    ) -> AsyncIterator[StreamChunk]: ...


class MockLLM:
    def __init__(self, canned: list[LLMResponse] | None = None) -> None:
        self._canned = canned or []
        self._idx = 0

    async def complete(
        self,
        *,
        system: str,
        messages: list[LLMMessage],
        tools: list[dict[str, Any]] | None = None,
        model: str | None = None,
        max_tokens: int = DEFAULT_LLM_MAX_TOKENS,
        temperature: float = DEFAULT_LLM_TEMPERATURE,
    ) -> LLMResponse:
        _ = system, messages, tools, model, max_tokens, temperature
        if not self._canned:
            return LLMResponse(text="ok")
        resp = self._canned[min(self._idx, len(self._canned) - 1)]
        self._idx += 1
        return resp

    async def stream(
        self,
        *,
        system: str,
        messages: list[LLMMessage],
        tools: list[dict[str, Any]] | None = None,
        model: str | None = None,
        max_tokens: int = DEFAULT_LLM_MAX_TOKENS,
        temperature: float = DEFAULT_LLM_TEMPERATURE,
    ) -> AsyncIterator[StreamChunk]:
        """No-op passthrough: emit the canned complete() text as a single chunk."""
        resp = await self.complete(
            system=system,
            messages=messages,
            tools=tools,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        if resp.text:
            yield StreamChunk(kind="text", text=resp.text)
        for call in resp.tool_calls or []:
            yield StreamChunk(
                kind="tool_use", tool_name=call.name, tool_input=call.arguments
            )
        yield StreamChunk(kind="stop")


class AnthropicLLM:
    def __init__(self, api_key: str | None = None, default_model: str | None = None) -> None:
        import anthropic

        self._client = (
            anthropic.AsyncAnthropic(api_key=api_key) if api_key else anthropic.AsyncAnthropic()
        )
        if not default_model:
            raise ValueError(
                "AnthropicLLM requires default_model; wire it from Settings.anthropic_default_model"
            )
        self._default_model = default_model

    async def complete(
        self,
        *,
        system: str,
        messages: list[LLMMessage],
        tools: list[dict[str, Any]] | None = None,
        model: str | None = None,
        max_tokens: int = DEFAULT_LLM_MAX_TOKENS,
        temperature: float = DEFAULT_LLM_TEMPERATURE,
    ) -> LLMResponse:
        api_messages = [{"role": m.role, "content": m.content} for m in messages if m.role != "system"]
        kwargs: dict[str, Any] = {
            "model": model or self._default_model,
            "system": system,
            "messages": api_messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if tools:
            kwargs["tools"] = tools

        resp = await self._client.messages.create(**kwargs)

        text_parts: list[str] = []
        calls: list[LLMToolCall] = []
        for block in resp.content:
            btype = getattr(block, "type", None)
            if btype == "text":
                text_parts.append(getattr(block, "text", ""))
            elif btype == "tool_use":
                args = getattr(block, "input", {}) or {}
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except json.JSONDecodeError:
                        args = {}
                calls.append(LLMToolCall(name=getattr(block, "name", ""), arguments=args))

        usage = getattr(resp, "usage", None)
        return LLMResponse(
            text="\n".join(text_parts).strip(),
            tool_calls=calls or None,
            usage_input_tokens=getattr(usage, "input_tokens", 0) if usage else 0,
            usage_output_tokens=getattr(usage, "output_tokens", 0) if usage else 0,
            stop_reason=getattr(resp, "stop_reason", "") or "",
        )

    async def stream(
        self,
        *,
        system: str,
        messages: list[LLMMessage],
        tools: list[dict[str, Any]] | None = None,
        model: str | None = None,
        max_tokens: int = DEFAULT_LLM_MAX_TOKENS,
        temperature: float = DEFAULT_LLM_TEMPERATURE,
    ) -> AsyncIterator[StreamChunk]:
        api_messages = [
            {"role": m.role, "content": m.content} for m in messages if m.role != "system"
        ]
        kwargs: dict[str, Any] = {
            "model": model or self._default_model,
            "system": system,
            "messages": api_messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if tools:
            kwargs["tools"] = tools

        # anthropic SDK exposes messages.stream() as an async context manager.
        async with self._client.messages.stream(**kwargs) as stream:
            async for text_delta in stream.text_stream:
                if text_delta:
                    yield StreamChunk(kind="text", text=text_delta)
            final = await stream.get_final_message()
            for block in getattr(final, "content", []) or []:
                if getattr(block, "type", None) == "tool_use":
                    args = getattr(block, "input", {}) or {}
                    if isinstance(args, str):
                        try:
                            args = json.loads(args)
                        except json.JSONDecodeError:
                            args = {}
                    yield StreamChunk(
                        kind="tool_use",
                        tool_name=getattr(block, "name", ""),
                        tool_input=args,
                    )
        yield StreamChunk(kind="stop")


class OpenRouterLLM:
    """OpenAI-compatible client aimed at OpenRouter (or any OAI-compatible endpoint).

    Anthropic-style `system` prompt is passed as the first message with role="system",
    matching OpenAI convention. Tool schema is auto-translated from Anthropic's
    `{name, description, input_schema}` to OpenAI's `{type: "function", function: {...}}`.
    """

    def __init__(
        self,
        api_key: str | None = None,
        default_model: str | None = None,
        base_url: str | None = None,
    ) -> None:
        from openai import AsyncOpenAI

        if not base_url:
            raise ValueError(
                "OpenRouterLLM requires base_url; wire it from Settings.openrouter_base_url"
            )
        if not default_model:
            raise ValueError(
                "OpenRouterLLM requires default_model; wire it from Settings.llm_model_general"
            )
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._default_model = default_model

    @staticmethod
    def _translate_tools(tools: list[dict[str, Any]] | None) -> list[dict[str, Any]] | None:
        if not tools:
            return None
        out: list[dict[str, Any]] = []
        for t in tools:
            # Already in OpenAI shape.
            if "function" in t and t.get("type") == "function":
                out.append(t)
                continue
            out.append(
                {
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t.get("description", ""),
                        "parameters": t.get("input_schema") or t.get("parameters") or {},
                    },
                }
            )
        return out

    async def complete(
        self,
        *,
        system: str,
        messages: list[LLMMessage],
        tools: list[dict[str, Any]] | None = None,
        model: str | None = None,
        max_tokens: int = DEFAULT_LLM_MAX_TOKENS,
        temperature: float = DEFAULT_LLM_TEMPERATURE,
    ) -> LLMResponse:
        api_messages: list[dict[str, Any]] = []
        if system:
            api_messages.append({"role": "system", "content": system})
        for m in messages:
            if m.role == "system":
                continue
            api_messages.append({"role": m.role, "content": m.content})

        kwargs: dict[str, Any] = {
            "model": model or self._default_model,
            "messages": api_messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        translated = self._translate_tools(tools)
        if translated:
            kwargs["tools"] = translated

        resp = await self._client.chat.completions.create(**kwargs)
        choice = resp.choices[0]
        msg = choice.message

        text = msg.content or ""
        calls: list[LLMToolCall] = []
        for tc in getattr(msg, "tool_calls", None) or []:
            fn = getattr(tc, "function", None)
            if fn is None:
                continue
            raw = getattr(fn, "arguments", "") or ""
            try:
                args = json.loads(raw) if isinstance(raw, str) else raw
            except json.JSONDecodeError:
                args = {}
            calls.append(LLMToolCall(name=getattr(fn, "name", ""), arguments=args or {}))

        usage = getattr(resp, "usage", None)
        return LLMResponse(
            text=text.strip(),
            tool_calls=calls or None,
            usage_input_tokens=getattr(usage, "prompt_tokens", 0) if usage else 0,
            usage_output_tokens=getattr(usage, "completion_tokens", 0) if usage else 0,
            stop_reason=choice.finish_reason or "",
        )

    async def stream(
        self,
        *,
        system: str,
        messages: list[LLMMessage],
        tools: list[dict[str, Any]] | None = None,
        model: str | None = None,
        max_tokens: int = DEFAULT_LLM_MAX_TOKENS,
        temperature: float = DEFAULT_LLM_TEMPERATURE,
    ) -> AsyncIterator[StreamChunk]:
        api_messages: list[dict[str, Any]] = []
        if system:
            api_messages.append({"role": "system", "content": system})
        for m in messages:
            if m.role == "system":
                continue
            api_messages.append({"role": m.role, "content": m.content})

        kwargs: dict[str, Any] = {
            "model": model or self._default_model,
            "messages": api_messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": True,
        }
        translated = self._translate_tools(tools)
        if translated:
            kwargs["tools"] = translated

        # Accumulate tool-call fragments across deltas (OpenAI streams them piecewise).
        tool_frags: dict[int, dict[str, Any]] = {}

        stream = await self._client.chat.completions.create(**kwargs)
        try:
            async for event in stream:
                choices = getattr(event, "choices", None) or []
                if not choices:
                    continue
                delta = getattr(choices[0], "delta", None)
                if delta is None:
                    continue
                content = getattr(delta, "content", None)
                if content:
                    yield StreamChunk(kind="text", text=content)
                for tc in getattr(delta, "tool_calls", None) or []:
                    idx = getattr(tc, "index", 0) or 0
                    frag = tool_frags.setdefault(idx, {"name": "", "args": ""})
                    fn = getattr(tc, "function", None)
                    if fn is None:
                        continue
                    name = getattr(fn, "name", None)
                    if name:
                        frag["name"] = name
                    args_piece = getattr(fn, "arguments", None)
                    if args_piece:
                        frag["args"] += args_piece
        finally:
            close = getattr(stream, "close", None)
            if close is not None:
                try:
                    await close()
                except Exception:
                    pass

        for frag in tool_frags.values():
            try:
                args = json.loads(frag["args"]) if frag["args"] else {}
            except json.JSONDecodeError:
                args = {}
            yield StreamChunk(
                kind="tool_use", tool_name=frag["name"], tool_input=args
            )
        yield StreamChunk(kind="stop")
