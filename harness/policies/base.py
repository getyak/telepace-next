"""Policy base + stack."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True, slots=True)
class PolicyDecision:
    allowed: bool
    reason: str = ""
    events: list[Any] = field(default_factory=list)


class Policy(ABC):
    name: str = "policy"

    @abstractmethod
    async def allow(self, command: Any, context: dict[str, Any]) -> PolicyDecision: ...

    async def observe(self, result: Any) -> list[Any]:
        _ = result
        return []


class PolicyStack:
    def __init__(self, policies: list[Policy]) -> None:
        self._policies = policies

    async def allow_all(self, command: Any, context: dict[str, Any]) -> PolicyDecision:
        emitted: list[Any] = []
        for p in self._policies:
            decision = await p.allow(command, context)
            emitted.extend(decision.events)
            if not decision.allowed:
                return PolicyDecision(
                    allowed=False,
                    reason=f"{p.name}: {decision.reason}",
                    events=emitted,
                )
        return PolicyDecision(allowed=True, events=emitted)

    async def observe_all(self, result: Any) -> list[Any]:
        out: list[Any] = []
        for p in self._policies:
            out.extend(await p.observe(result))
        return out
