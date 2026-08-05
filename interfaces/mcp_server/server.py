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
from agents.shared import build_llm_from_settings
from core.constants import MCP_READ_SCOPE, MCP_WRITE_SCOPE, PRODUCT_NAME
from core.domain.models import CampaignSpec
from core.events import StudyDrafted
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
from harness.handlers import DispatchHandler
from interfaces.channels.email_mock import MockEmail
from interfaces.channels.phone_mock import MockPhone
from interfaces.channels.sms_mock import MockSMS
from interfaces.mcp_server.auth import resolve_mcp_identity
from interfaces.mcp_server.readers import (
    AnalystFollowupService,
    EventStoreTranscriptReader,
    ProjectorInsightReader,
)
from interfaces.mcp_server.tools import TOOL_HANDLERS
from interfaces.rest_api.config import Settings, get_settings
from storage.event_store import PostgresEventStore
from storage.projections import CAMPAIGN_PROJECTION_SQL, CampaignProjector

_MUTATING_TOOLS = {
    "create_campaign",
    "refine_outline",
    "start_campaign",
    "dispatch_invites",
    "push_insights",
}


async def build_harness_and_projector(
    settings: Settings,
) -> tuple[
    Harness,
    CampaignProjector,
    PostgresEventStore,
    AnalystAgent,
    RedisMemory,
    asyncpg.Pool,
]:
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
            model=settings.llm_model_fast,
            seed_timeout_seconds=settings.designer_seed_timeout_seconds,
        ),
        "interviewer": InterviewerAgent(
            llm=llm,
            max_tokens=settings.interviewer_max_tokens,
            temperature=settings.interviewer_temperature,
        ),
        "coordinator": CoordinatorAgent(
            insight_email=MockEmail(log_dir=settings.dispatch_log_dir),
            public_base_url=settings.public_base_url,
        ),
        "dispatch": DispatchHandler(
            email=MockEmail(log_dir=settings.dispatch_log_dir),
            sms=MockSMS(log_dir=settings.dispatch_log_dir),
            phone=MockPhone(log_dir=settings.dispatch_log_dir),
            share_url_base=settings.public_base_url,
            actor_prefix_agent=settings.actor_prefix_agent,
        ),
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
    return harness, projector, store, _analyst, memory, pool


async def apply_pending_to_projection(
    campaign_id: UUID,
    *,
    store: PostgresEventStore,
    memory: RedisMemory,
    projector: CampaignProjector,
) -> None:
    """Synchronize one MCP-mutated campaign before returning to the client.

    The REST write routes already perform this read-after-write projection
    synchronization. The standalone MCP process must do the same: otherwise a
    Codex chain such as create -> progress observes a missing campaign until a
    separate API worker happens to project the events.
    """

    context = await memory.load(campaign_id)
    spec_data = context.get("spec") if isinstance(context, dict) else None
    org_id = context.get("org_id") if isinstance(context, dict) else None
    for stored in await store.read_stream(campaign_id):
        if isinstance(stored.event, StudyDrafted):
            if spec_data is None or org_id is None:
                continue
            await projector.apply(
                stored.seq,
                stored.event,
                initial_spec=CampaignSpec.model_validate(spec_data),
                org_id=UUID(str(org_id)),
            )
        else:
            await projector.apply(stored.seq, stored.event)


async def assert_campaign_access(
    campaign_id: UUID,
    *,
    org_id: UUID,
    projector: CampaignProjector,
) -> None:
    """Fail closed before any campaign-scoped tool crosses a tenant boundary."""

    campaign = await projector.get_campaign(campaign_id)
    if campaign is not None and campaign.org_id != org_id:
        raise PermissionError("campaign does not belong to the authenticated tenant")


def assert_tool_scope(name: str, mcp_session: Any) -> None:
    """Require the read/write scope encoded in authenticated user tokens."""

    if name == "get_session" or not mcp_session.authenticated:
        return
    required = MCP_WRITE_SCOPE if name in _MUTATING_TOOLS else MCP_READ_SCOPE
    if required not in mcp_session.scopes:
        raise PermissionError(f"Telepace MCP token is missing required scope: {required}")


def _tool_schema(input_cls: type) -> dict[str, Any]:
    return input_cls.model_json_schema()


async def main() -> None:
    settings = get_settings()
    mcp_session = resolve_mcp_identity(settings)
    harness, projector, store, analyst, memory, projection_pool = await build_harness_and_projector(
        settings
    )
    public_base = settings.public_base_url
    default_org = mcp_session.org_id
    default_author = mcp_session.user_id

    insight_reader = ProjectorInsightReader(projector)
    followup_service = AnalystFollowupService(
        analyst=analyst,
        transcript_reader=EventStoreTranscriptReader(store),
    )

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
        assert_tool_scope(name, mcp_session)
        requested_campaign_id = arguments.get("campaign_id")
        if requested_campaign_id is not None:
            await assert_campaign_access(
                UUID(str(requested_campaign_id)),
                org_id=default_org,
                projector=projector,
            )
        result = await handler(
            arguments,
            harness=harness,
            projector=projector,
            insight_reader=insight_reader,
            followup_service=followup_service,
            org_id=default_org,
            author_id=default_author,
            public_base_url=public_base,
            mcp_session=mcp_session,
        )
        campaign_id = result.get("campaign_id") if isinstance(result, dict) else None
        campaign_id = campaign_id or arguments.get("campaign_id")
        if campaign_id is not None:
            await apply_pending_to_projection(
                UUID(str(campaign_id)),
                store=store,
                memory=memory,
                projector=projector,
            )
        import orjson

        return [mcp_types.TextContent(type="text", text=orjson.dumps(result).decode())]

    async with mcp.server.stdio.stdio_server() as (read, write):
        try:
            await server.run(read, write, server.create_initialization_options())
        finally:
            await store.stop()
            await projection_pool.close()


def run() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    run()
