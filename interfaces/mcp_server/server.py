"""MCP server entrypoint. Serves telepace tools over stdio."""

from __future__ import annotations

import asyncio
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
from core.constants import PRODUCT_NAME
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
from interfaces.rest_api.config import Settings, get_settings
from storage.event_store import PostgresEventStore
from storage.projections import CAMPAIGN_PROJECTION_SQL, CampaignProjector


class _NullInsightReader:
    async def list_insights(self, **_: Any) -> list[dict[str, Any]]:
        return []


class _NullFollowupService:
    async def answer(self, **_: Any) -> dict[str, Any]:
        return {"answer": "not implemented yet", "evidence": []}


async def build_harness_and_projector(
    settings: Settings,
) -> tuple[Harness, CampaignProjector, PostgresEventStore]:
    store = PostgresEventStore(
        settings.database_url,
        pool_min_size=settings.pg_pool_min_size,
        pool_max_size=settings.pg_pool_max_size,
        maintenance_interval_s=settings.event_store_maintenance_interval_s,
    )
    await store.start()

    pool = await asyncpg.create_pool(
        settings.database_url,
        min_size=settings.pg_pool_min_size,
        max_size=settings.pg_pool_max_size,
    )
    async with pool.acquire() as conn:
        await conn.execute(CAMPAIGN_PROJECTION_SQL)
    projector = CampaignProjector(pool)

    import redis.asyncio as redis

    redis_client = redis.from_url(settings.redis_url, decode_responses=False)
    memory = RedisMemory(redis_client, ttl_seconds=settings.memory_ttl_seconds)

    llm = build_llm_from_settings(settings, strict=True)

    agents = {
        "designer": DesignerAgent(
            llm=llm,
            max_tokens=settings.designer_max_tokens,
            temperature=settings.designer_temperature,
        ),
        "interviewer": InterviewerAgent(
            llm=llm,
            max_tokens=settings.interviewer_max_tokens,
            temperature=settings.interviewer_temperature,
        ),
        "coordinator": CoordinatorAgent(),
    }
    _analyst = AnalystAgent(
        llm=llm,
        max_tokens=settings.analyst_max_tokens,
        temperature=settings.analyst_temperature,
    )

    harness = Harness(
        event_store=store,
        memory=memory,
        router=IntentRouter(),
        policies=PolicyStack(
            [
                BudgetPolicy(
                    warn_ratio=settings.budget_warn_ratio,
                    hard_stop_ratio=settings.budget_hard_stop_ratio,
                ),
                PIIPolicy(),
                EscalationPolicy(),
            ]
        ),
        agents=agents,
        tracer=NullTracer(),
    )
    return harness, projector, store


def _tool_schema(input_cls: type) -> dict[str, Any]:
    return input_cls.model_json_schema()


async def main() -> None:
    settings = get_settings()
    harness, projector, store = await build_harness_and_projector(settings)
    public_base = settings.public_base_url
    default_org = UUID(settings.default_org_id)
    default_author = UUID(settings.default_author_id)

    server = Server(PRODUCT_NAME)

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
