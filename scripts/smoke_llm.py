"""Smoke-test the configured LLM provider with a real API call.

Reads ``.env`` via ``Settings``, constructs the LLM client through the
single-source factory, sends a tiny prompt, and prints provider / model /
usage / response.

Usage::

    python -m scripts.smoke_llm
    python -m scripts.smoke_llm --prompt "hello"
    python -m scripts.smoke_llm --model deepseek/deepseek-v4-flash
    python -m scripts.smoke_llm --stream

Exit code 0 on success (non-empty response), 1 on failure. Failure never
falls back to Mock — the whole point of this script is to prove the real
API works.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from agents.shared import LLMConfigError, build_llm_from_settings
from agents.shared.llm import LLMMessage
from interfaces.rest_api.config import get_settings


async def _run_complete(client, model: str | None, prompt: str) -> int:
    resp = await client.complete(
        system="You are a terse assistant. Reply in <= 12 words.",
        messages=[LLMMessage(role="user", content=prompt)],
        model=model,
        max_tokens=64,
        temperature=0.2,
    )
    text = (resp.text or "").strip()
    print(f"response   : {text!r}")
    print(f"tokens     : in={resp.usage_input_tokens} out={resp.usage_output_tokens}")
    print(f"stop_reason: {resp.stop_reason!r}")
    return 0 if text else 1


async def _run_stream(client, model: str | None, prompt: str) -> int:
    print("streaming  :")
    chars = 0
    async for chunk in client.stream(
        system="You are a terse assistant. Reply in <= 12 words.",
        messages=[LLMMessage(role="user", content=prompt)],
        model=model,
        max_tokens=64,
        temperature=0.2,
    ):
        if chunk.kind == "text" and chunk.text:
            sys.stdout.write(chunk.text)
            sys.stdout.flush()
            chars += len(chunk.text)
    print()
    return 0 if chars else 1


async def _main(prompt: str, model: str | None, stream: bool) -> int:
    settings = get_settings()
    print(f"provider   : {settings.llm_provider}")
    print(f"base_url   : {settings.openrouter_base_url}")
    print(f"model      : {model or settings.llm_model_general}")

    try:
        client = build_llm_from_settings(settings, strict=True)
    except LLMConfigError as exc:
        print(f"config error: {exc}", file=sys.stderr)
        return 2

    print(f"client     : {type(client).__name__}")
    print(f"prompt     : {prompt!r}")
    print("---")

    if stream:
        return await _run_stream(client, model, prompt)
    return await _run_complete(client, model, prompt)


def main() -> None:
    p = argparse.ArgumentParser(description="LLM smoke test.")
    p.add_argument("--prompt", default="Reply with exactly the word: pong")
    p.add_argument("--model", default=None, help="Override default model.")
    p.add_argument("--stream", action="store_true", help="Use streaming API.")
    args = p.parse_args()
    sys.exit(asyncio.run(_main(args.prompt, args.model, args.stream)))


if __name__ == "__main__":
    main()
