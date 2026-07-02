"""Load versioned system prompts from agents/{name}/prompts/{version}.md."""

from __future__ import annotations

from pathlib import Path

AGENTS_ROOT = Path(__file__).resolve().parent.parent


def load_prompt(agent_name: str, version: str = "v1") -> str:
    path = AGENTS_ROOT / agent_name / "prompts" / f"{version}.md"
    if not path.exists():
        raise FileNotFoundError(f"prompt not found: {path}")
    return path.read_text(encoding="utf-8")
