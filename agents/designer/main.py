"""DesignerAgent: helps a researcher spec a study via natural language."""

from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from agents.shared import LLMClient, load_prompt
from agents.shared.llm import LLMMessage
from core.events import EventBase, SpecUpdated, StudyDrafted
from core.protocols.commands import CreateCampaign, RefineOutline, spec_from_create
from harness.orchestrator import AgentResult

if TYPE_CHECKING:
    from harness.orchestrator import Harness


_SPEC_PATCH = re.compile(r"<spec_patch>(.*?)</spec_patch>", re.DOTALL)
_SPEC_PATCH_OPEN = "<spec_patch>"
_SPEC_PATCH_CLOSE = "</spec_patch>"


class DesignerAgent:
    def __init__(self, llm: LLMClient, prompt_version: str = "v1") -> None:
        self._llm = llm
        self._system = load_prompt("designer", prompt_version)

    async def run(
        self, command: Any, context: dict[str, Any], harness: Harness
    ) -> AgentResult:
        _ = harness
        if isinstance(command, CreateCampaign):
            return await self._on_create(command)
        if isinstance(command, RefineOutline):
            return await self._on_refine(command, context)
        return AgentResult(response={"error": f"unsupported command {type(command).__name__}"})

    async def _on_create(self, cmd: CreateCampaign) -> AgentResult:
        campaign_id = uuid4()
        spec = spec_from_create(cmd)
        events: list[EventBase] = [
            StudyDrafted(
                campaign_id=campaign_id,
                actor=f"user:{cmd.author_id}",
                title=cmd.title,
                author_id=cmd.author_id,
            ),
            SpecUpdated(
                campaign_id=campaign_id,
                actor="agent:designer",
                patch=spec.model_dump(mode="json"),
                reason="initial spec draft from create command",
            ),
        ]
        return AgentResult(
            events=events,
            state_delta={
                "budget_usd": cmd.budget_usd,
                "spent_usd": 0.0,
                "target_completions": cmd.target_completions,
                "org_id": str(cmd.org_id),
                "spec": spec.model_dump(mode="json"),
            },
            response={"campaign_id": str(campaign_id), "title": cmd.title, "status": "draft"},
        )

    async def _on_refine(self, cmd: RefineOutline, context: dict[str, Any]) -> AgentResult:
        assert cmd.campaign_id is not None
        current_spec = context.get("spec", {})
        user_msg = (
            f"Current spec JSON:\n```json\n{json.dumps(current_spec, ensure_ascii=False, indent=2)}\n```\n\n"
            f"Instruction: {cmd.instruction}\n\n"
            "Reply with a short natural summary AND a <spec_patch>{...}</spec_patch> JSON block "
            "containing ONLY the fields that changed."
        )
        resp = await self._llm.complete(
            system=self._system,
            messages=[LLMMessage(role="user", content=user_msg)],
            max_tokens=1500,
            temperature=0.3,
        )
        patch: dict[str, Any] = {}
        m = _SPEC_PATCH.search(resp.text)
        if m:
            try:
                patch = json.loads(m.group(1))
            except json.JSONDecodeError:
                patch = {}
        events: list[EventBase] = [
            SpecUpdated(
                campaign_id=cmd.campaign_id,
                actor="agent:designer",
                patch=patch,
                reason=cmd.instruction[:200],
            )
        ]
        return AgentResult(
            events=events,
            state_delta={"last_designer_reply": resp.text},
            response={"summary": resp.text, "patch": patch},
        )

    async def refine_stream(
        self,
        *,
        current_spec: dict[str, Any],
        instruction: str,
    ) -> AsyncIterator[dict[str, Any]]:
        """Stream a refinement from the LLM.

        Yields dicts of shape:
          {"type": "delta", "text": "..."}       — each text delta from the LLM
          {"type": "spec_patch", "patch": {...}} — as soon as </spec_patch> closes
          {"type": "done", "summary": "..."}     — final message with the
                                                    spec_patch block stripped
        On JSON parse failure the patch event is still emitted with the raw
        JSON string under key `raw` so the caller can decide what to do.
        """
        user_msg = (
            f"Current spec JSON:\n```json\n{json.dumps(current_spec, ensure_ascii=False, indent=2)}\n```\n\n"
            f"Instruction: {instruction}\n\n"
            "Reply with a short natural summary AND a <spec_patch>{...}</spec_patch> JSON block "
            "containing ONLY the fields that changed."
        )
        buf = ""
        patch_emitted = False
        async for chunk in self._llm.stream(
            system=self._system,
            messages=[LLMMessage(role="user", content=user_msg)],
            max_tokens=1500,
            temperature=0.3,
        ):
            if chunk.kind == "stop":
                break
            if chunk.kind != "text" or not chunk.text:
                continue
            yield {"type": "delta", "text": chunk.text}
            buf += chunk.text
            if not patch_emitted:
                close_idx = buf.find(_SPEC_PATCH_CLOSE)
                open_idx = buf.find(_SPEC_PATCH_OPEN)
                if open_idx != -1 and close_idx != -1 and close_idx > open_idx:
                    raw = buf[open_idx + len(_SPEC_PATCH_OPEN) : close_idx].strip()
                    try:
                        patch = json.loads(raw)
                        yield {"type": "spec_patch", "patch": patch}
                    except json.JSONDecodeError:
                        yield {"type": "spec_patch", "patch": {}, "raw": raw}
                    patch_emitted = True

        summary = _SPEC_PATCH.sub("", buf).strip()
        yield {"type": "done", "summary": summary, "full_text": buf}
