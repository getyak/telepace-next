"""IntentRouter: map a Command to the Agent responsible for handling it."""

from __future__ import annotations

from typing import Any

_ROUTING_TABLE: dict[str, str] = {
    "create_campaign": "designer",
    "refine_outline": "designer",
    "register_respondents": "coordinator",
    "start_campaign": "coordinator",
    "reply_in_interview": "interviewer",
    "push_insights": "coordinator",
    "dispatch_invites": "dispatch",
}


class IntentRouter:
    def route(self, command: Any, context: dict[str, Any] | None = None) -> str:
        _ = context
        cmd_type = getattr(command, "type", None)
        if not isinstance(cmd_type, str):
            raise ValueError(f"command missing 'type': {command!r}")
        agent = _ROUTING_TABLE.get(cmd_type)
        if agent is None:
            raise ValueError(f"no agent registered for command type {cmd_type!r}")
        return agent
