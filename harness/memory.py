"""HarnessMemory: campaign-level short-term context, cached in Redis."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any
from uuid import UUID

import orjson


class HarnessMemory(ABC):
    @abstractmethod
    async def load(self, campaign_id: UUID) -> dict[str, Any]: ...

    @abstractmethod
    async def update(self, campaign_id: UUID, delta: dict[str, Any]) -> None: ...

    @abstractmethod
    async def clear(self, campaign_id: UUID) -> None: ...

    @abstractmethod
    async def claim_once(self, key: str, *, ttl_seconds: int) -> bool: ...


class InMemoryMemory(HarnessMemory):
    def __init__(self) -> None:
        self._data: dict[UUID, dict[str, Any]] = {}
        self._claims: set[str] = set()

    async def load(self, campaign_id: UUID) -> dict[str, Any]:
        return dict(self._data.get(campaign_id, {}))

    async def update(self, campaign_id: UUID, delta: dict[str, Any]) -> None:
        self._data.setdefault(campaign_id, {}).update(delta)

    async def clear(self, campaign_id: UUID) -> None:
        self._data.pop(campaign_id, None)

    async def claim_once(self, key: str, *, ttl_seconds: int) -> bool:
        _ = ttl_seconds
        if key in self._claims:
            return False
        self._claims.add(key)
        return True


class RedisMemory(HarnessMemory):
    KEY_TPL = "campaign:{cid}:memory"
    CLAIM_TPL = "claim:{key}"

    def __init__(self, client: Any, *, ttl_seconds: int) -> None:
        self._client = client
        self._ttl_seconds = ttl_seconds

    async def load(self, campaign_id: UUID) -> dict[str, Any]:
        raw = await self._client.get(self.KEY_TPL.format(cid=campaign_id))
        if not raw:
            return {}
        return orjson.loads(raw)

    async def update(self, campaign_id: UUID, delta: dict[str, Any]) -> None:
        key = self.KEY_TPL.format(cid=campaign_id)
        current = await self.load(campaign_id)
        current.update(delta)
        await self._client.set(key, orjson.dumps(current), ex=self._ttl_seconds)

    async def clear(self, campaign_id: UUID) -> None:
        await self._client.delete(self.KEY_TPL.format(cid=campaign_id))

    async def claim_once(self, key: str, *, ttl_seconds: int) -> bool:
        claimed = await self._client.set(
            self.CLAIM_TPL.format(key=key),
            b"1",
            ex=max(1, ttl_seconds),
            nx=True,
        )
        return bool(claimed)
