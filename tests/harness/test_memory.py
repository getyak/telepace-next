"""HarnessMemory unit tests: InMemoryMemory + RedisMemory."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import orjson
import pytest

from harness.memory import InMemoryMemory, RedisMemory


async def test_in_memory_load_returns_empty_for_unknown() -> None:
    m = InMemoryMemory()
    assert await m.load(uuid4()) == {}


async def test_in_memory_update_and_load_roundtrip() -> None:
    m = InMemoryMemory()
    cid = uuid4()
    await m.update(cid, {"spent_usd": 5.0, "invited": 3})
    loaded = await m.load(cid)
    assert loaded == {"spent_usd": 5.0, "invited": 3}


async def test_in_memory_update_merges_not_replaces() -> None:
    m = InMemoryMemory()
    cid = uuid4()
    await m.update(cid, {"a": 1, "b": 2})
    await m.update(cid, {"b": 20, "c": 3})
    assert await m.load(cid) == {"a": 1, "b": 20, "c": 3}


async def test_in_memory_load_returns_defensive_copy() -> None:
    m = InMemoryMemory()
    cid = uuid4()
    await m.update(cid, {"a": 1})
    loaded = await m.load(cid)
    loaded["a"] = 999
    assert (await m.load(cid))["a"] == 1


async def test_in_memory_clear_removes_campaign() -> None:
    m = InMemoryMemory()
    cid = uuid4()
    await m.update(cid, {"x": 1})
    await m.clear(cid)
    assert await m.load(cid) == {}


async def test_in_memory_clear_of_unknown_is_noop() -> None:
    m = InMemoryMemory()
    await m.clear(uuid4())


async def test_in_memory_isolates_campaigns() -> None:
    m = InMemoryMemory()
    a, b = uuid4(), uuid4()
    await m.update(a, {"key": "A"})
    await m.update(b, {"key": "B"})
    assert (await m.load(a))["key"] == "A"
    assert (await m.load(b))["key"] == "B"


class _FakeRedis:
    """Minimal in-memory stand-in for redis.asyncio client."""

    def __init__(self) -> None:
        self.store: dict[str, bytes] = {}
        self.ex: dict[str, int] = {}

    async def get(self, key: str) -> bytes | None:
        return self.store.get(key)

    async def set(self, key: str, value: bytes, ex: int | None = None) -> None:
        self.store[key] = value
        if ex is not None:
            self.ex[key] = ex

    async def delete(self, key: str) -> None:
        self.store.pop(key, None)
        self.ex.pop(key, None)


async def test_redis_memory_load_returns_empty_when_missing() -> None:
    m = RedisMemory(_FakeRedis())
    assert await m.load(uuid4()) == {}


async def test_redis_memory_update_serialises_and_sets_ttl() -> None:
    fake = _FakeRedis()
    m = RedisMemory(fake)
    cid = uuid4()
    await m.update(cid, {"spent_usd": 1.5, "themes": ["pricing"]})
    key = RedisMemory.KEY_TPL.format(cid=cid)
    assert key in fake.store
    assert fake.ex[key] == RedisMemory.TTL_SECONDS
    assert orjson.loads(fake.store[key]) == {"spent_usd": 1.5, "themes": ["pricing"]}


async def test_redis_memory_update_merges_existing_document() -> None:
    fake = _FakeRedis()
    m = RedisMemory(fake)
    cid = uuid4()
    await m.update(cid, {"a": 1})
    await m.update(cid, {"b": 2})
    loaded = await m.load(cid)
    assert loaded == {"a": 1, "b": 2}


async def test_redis_memory_clear_deletes_key() -> None:
    fake = _FakeRedis()
    m = RedisMemory(fake)
    cid = uuid4()
    await m.update(cid, {"x": 1})
    await m.clear(cid)
    assert await m.load(cid) == {}


async def test_redis_memory_load_parses_prewritten_value() -> None:
    fake = _FakeRedis()
    cid = uuid4()
    fake.store[RedisMemory.KEY_TPL.format(cid=cid)] = orjson.dumps({"k": "v"})
    m = RedisMemory(fake)
    assert await m.load(cid) == {"k": "v"}


@pytest.mark.parametrize("delta", [{}, {"a": None}, {"nested": {"deep": [1, 2]}}])
async def test_in_memory_accepts_edge_case_deltas(delta: dict[str, Any]) -> None:
    m = InMemoryMemory()
    cid = uuid4()
    await m.update(cid, delta)
    loaded = await m.load(cid)
    for k, v in delta.items():
        assert loaded[k] == v
