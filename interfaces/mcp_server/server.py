"""MCP server entrypoint. Serves telepace tools over stdio."""

from __future__ import annotations

import asyncio
import os
from typing import Any
from uuid import UUID

import asyncpg
import mcp.server.stdio
import mcp.types as mcp_types
from mcp.server import Server

from agents.analyst import AnalystAgent
from agents.coordinator import CoordinatorAgent
from agents.designer import DesignerAgent
from agents.interviewer import InterviewerAgent
from agents.shared import AnthropicLLM
from core.protocols.mcp_tools import MCP_TOOL_REGISTRY
from harness import (
    BudgetPolicy,
    EscalationPolicy,
    Harness,
    IntentRouter,
    NullTracer,
    PIIPolicy,
    PolicyStack,
    RedisMemory,
)
from interfaces.mcp_server.tools import TOOL_HANDLERS
from storage.event_store import PostgresEventStore
from storage.projections import CAMPAIGN_PROJECTION_SQL, CampaignProjector


class _NullInsightReader:
    async def list_insights(self, **_: Any) -> list[dict[str, Any]]:
        return []


class _NullFollowupService:
    async def answer(self, **_: Any) -> dict[str, Any]:
        return {"answer": "not implemented yet", "evidence": []}


async def build_harness_and_projector() -> tuple[Harness, CampaignProjector, PostgresEventStore]:
    dsn = os.environ["TELEPACE_DATABASE_URL"]
    redis_url = os.environ.get("TELEPACE_REDIS_URL", "redis://localhost:6379/0")

    store = PostgresEventStore(dsn)
    await store.start()

    pool = await asyncpg.create_pool(dsn, min_size=1, max_size=5)
    async with pool.acquire() as conn:
        await conn.execute(CAMPAIGN_PROJECTION_SQL)
    projector = CampaignProjector(pool)

    import redis.asyncio as redis

    redis_client = redis.from_url(redis_url, decode_responses=False)
    memory = RedisMemory(redis_client)

    llm = AnthropicLLM()

    agents = {
        "designer": DesignerAgent(llm=llm),
        "interviewer": InterviewerAgent(llm=llm),
        "coordinator": CoordinatorAgent(),
    }
    _analyst = AnalystAgent(llm=llm)

    harness = Harness(
        event_store=store,
        memory=memory,
        router=IntentRouter(),
        policies=PolicyStack([BudgetPolicy(), PIIPolicy(), EscalationPolicy()]),
        agents=agents,
        tracer=NullTracer(),
    )
    return harness, projector, store


def _tool_schema(input_cls: type) -> dict[str, Any]:
    return input_cls.model_json_schema()


async def main() -> None:
    harness, projector, store = await build_harness_and_projector()
    public_base = os.environ.get("TELEPACE_PUBLIC_BASE_URL", "http://localhost:3000")
    default_org = UUID(
        os.environ.get("TELEPACE_DEFAULT_ORG_ID", "00000000-0000-0000-0000-000000000001")
    )
    default_author = UUID(
        os.environ.get("TELEPACE_DEFAULT_AUTHOR_ID", "00000000-0000-0000-0000-000000000002")
    )

    server = Server("telepace")

    @server.list_tools()
    async def _list_tools() -> list[mcp_types.Tool]:
        return [
            mcp_types.Tool(
                name=name,
                description=desc,
                inputSchema=_tool_schema(input_cls),
            )
            for name, (input_cls, _out_cls, desc) in MCP_TOOL_REGISTRY.items()
        ]

    @server.call_tool()
    async def _call_tool(name: str, arguments: dict[str, Any]) -> list[mcp_types.TextContent]:
        handler = TOOL_HANDLERS.get(name)
        if handler is None:
            raise ValueError(f"unknown tool: {name}")
        result = await handler(
            arguments,
            harness=harness,
            projector=projector,
            insight_reader=_NullInsightReader(),
            followup_service=_NullFollowupService(),
            org_id=default_org,
            author_id=default_author,
            public_base_url=public_base,
        )
        import orjson

        return [mcp_types.TextContent(type="text", text=orjson.dumps(result).decode())]

    async with mcp.server.stdio.stdio_server() as (read, write):
        try:
            await server.run(read, write, server.create_initialization_options())
        finally:
            await store.stop()


def run() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    run()
