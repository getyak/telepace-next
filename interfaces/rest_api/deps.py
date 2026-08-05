"""FastAPI dependency wiring: app singletons for Harness, Projector, EventStore."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from uuid import UUID

import asyncpg
import redis.asyncio as redis
from fastapi import Request

from agents.analyst import AnalystAgent
from agents.coordinator import CoordinatorAgent
from agents.designer import DesignerAgent
from agents.interviewer import InterviewerAgent
from agents.orchestrator import OrchestratorAgent
from agents.shared import build_llm_from_settings
from core.billing import PlanKind, QualityGateConfig
from core.billing.gateway import MockPaymentGateway, PaymentGateway, StripeGateway
from core.billing.service import BillingService
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
from interfaces.channels.base import EmailDispatcher, PhoneDispatcher, SmsDispatcher
from interfaces.channels.email_mock import MockEmail
from interfaces.channels.email_resend import ResendEmail
from interfaces.channels.phone_mock import MockPhone
from interfaces.channels.phone_vapi import VapiPhone
from interfaces.channels.sms_mock import MockSMS
from interfaces.channels.sms_twilio import TwilioSMS
from interfaces.mcp_server.readers import (
    AnalystFollowupService,
    EventStoreTranscriptReader,
    ProjectorInsightReader,
)
from interfaces.mcp_server.tools import TOOL_HANDLERS
from interfaces.rest_api.auth.users_repo import USERS_SCHEMA_SQL, UsersRepo
from interfaces.rest_api.config import Settings, get_settings
from storage.agent_runs import (
    AGENT_RUNS_SCHEMA_SQL,
    AgentArtifactStore,
    AgentConfirmationStore,
    AgentMemoryStore,
    AgentRunStore,
    PostgresAgentRunStore,
)
from storage.billing import BILLING_SCHEMA_SQL, BillingRepo
from storage.event_store import PostgresEventStore
from storage.projections import CAMPAIGN_PROJECTION_SQL, CampaignProjector


@dataclass(slots=True)
class AppState:
    settings: Settings
    event_store: PostgresEventStore
    pool: asyncpg.Pool
    projector: CampaignProjector
    harness: Harness
    analyst: AnalystAgent
    email_dispatcher: EmailDispatcher
    sms_dispatcher: SmsDispatcher
    phone_dispatcher: PhoneDispatcher
    users_repo: UsersRepo | None
    llm: object = None  # LLMClient — used by ad-hoc endpoints (e.g. simulate)
    memory: object = None  # HarnessMemory — used to hydrate projection sync
    # Shared read-side services for the conversational agent. The Orchestrator
    # itself is built per-request (it needs the caller's org_id/author_id), but
    # these dependencies are process-wide singletons.
    insight_reader: object = None  # ProjectorInsightReader
    followup_service: object = None  # AnalystFollowupService
    # Billing (T-621..T-624). None when billing_provider="disabled" — quota
    # enforcement and /v1/billing/* degrade gracefully in that case.
    billing: BillingService | None = None
    billing_repo: BillingRepo | None = None
    billing_gateway: PaymentGateway | None = None
    agent_runs: AgentRunStore | None = None
    agent_artifacts: AgentArtifactStore | None = None
    agent_memories: AgentMemoryStore | None = None
    agent_confirmations: AgentConfirmationStore | None = None
    agent_run_tasks: set[asyncio.Task[None]] | None = None


async def build_state() -> AppState:
    settings = get_settings()

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
        await conn.execute(USERS_SCHEMA_SQL)
        await conn.execute(BILLING_SCHEMA_SQL)
        await conn.execute(AGENT_RUNS_SCHEMA_SQL)
    projector = CampaignProjector(pool)
    users_repo = UsersRepo(pool)
    billing_repo, billing_gateway, billing_service = _build_billing(settings, pool)

    redis_client = redis.from_url(settings.redis_url, decode_responses=False)
    memory = RedisMemory(redis_client, ttl_seconds=settings.memory_ttl_seconds)

    llm = build_llm_from_settings(settings, strict=True)

    email_dispatcher = _build_email(settings)
    sms_dispatcher = _build_sms(settings)
    phone_dispatcher = _build_phone(settings)

    dispatch_handler = DispatchHandler(
        email=email_dispatcher,
        sms=sms_dispatcher,
        phone=phone_dispatcher,
        share_url_base=settings.public_base_url,
        actor_prefix_agent=settings.actor_prefix_agent,
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
        agents={
            "designer": DesignerAgent(
                llm=llm,
                max_tokens=settings.designer_max_tokens,
                temperature=settings.designer_temperature,
                # Creating/refining a guide is interactive; use the fast model
                # and let the strict seed schema preserve output quality.
                model=settings.llm_model_fast,
                seed_timeout_seconds=settings.designer_seed_timeout_seconds,
            ),
            "interviewer": InterviewerAgent(
                llm=llm,
                max_tokens=settings.interviewer_max_tokens,
                temperature=settings.interviewer_temperature,
                # Per-turn latency matters most here, and reasoning models
                # (glm-4.x) leak their chain of thought into `text` when
                # content comes back empty — pin the fast non-reasoning model.
                model=settings.llm_model_fast,
            ),
            "coordinator": CoordinatorAgent(
                insight_email=email_dispatcher,
                public_base_url=settings.public_base_url,
            ),
            "dispatch": dispatch_handler,
        },
        tracer=NullTracer(),
    )

    analyst = AnalystAgent(
        llm=llm,
        max_tokens=settings.analyst_max_tokens,
        temperature=settings.analyst_temperature,
    )
    insight_reader = ProjectorInsightReader(projector)
    followup_service = AnalystFollowupService(
        analyst=analyst,
        transcript_reader=EventStoreTranscriptReader(store),
    )

    agent_run_store = PostgresAgentRunStore(pool)
    return AppState(
        settings=settings,
        event_store=store,
        pool=pool,
        projector=projector,
        harness=harness,
        analyst=analyst,
        email_dispatcher=email_dispatcher,
        sms_dispatcher=sms_dispatcher,
        phone_dispatcher=phone_dispatcher,
        users_repo=users_repo,
        llm=llm,
        memory=memory,
        insight_reader=insight_reader,
        followup_service=followup_service,
        billing=billing_service,
        billing_repo=billing_repo,
        billing_gateway=billing_gateway,
        agent_runs=agent_run_store,
        agent_artifacts=agent_run_store,
        agent_memories=agent_run_store,
        agent_confirmations=agent_run_store,
        agent_run_tasks=set(),
    )


def _build_billing(
    settings: Settings, pool: asyncpg.Pool
) -> tuple[BillingRepo | None, PaymentGateway | None, BillingService | None]:
    """Wire the billing stack from Settings.

    provider="stripe" needs a secret key + price ids; without them we fall
    back to the mock gateway (usage metering + free-tier quota still work,
    checkout returns mock URLs). provider="disabled" turns billing off.
    """
    provider = (settings.billing_provider or "stripe").lower()
    if provider == "disabled":
        return None, None, None

    repo = BillingRepo(pool)
    gateway: PaymentGateway
    if (
        provider == "stripe"
        and settings.stripe_secret_key
        and settings.stripe_price_pro
        and settings.stripe_price_team
    ):
        overage_ids = {
            kind: price
            for kind, price in (
                (PlanKind.PRO, settings.stripe_price_pro_overage),
                (PlanKind.TEAM, settings.stripe_price_team_overage),
            )
            if price
        }
        gateway = StripeGateway(
            secret_key=settings.stripe_secret_key,
            webhook_secret=settings.stripe_webhook_secret or "",
            price_ids={
                PlanKind.PRO: settings.stripe_price_pro,
                PlanKind.TEAM: settings.stripe_price_team,
            },
            meter_event_name=settings.stripe_meter_event_name,
            overage_price_ids=overage_ids,
        )
    else:
        gateway = MockPaymentGateway()

    service = BillingService(
        repo=repo,
        gateway=gateway,
        quality_config=QualityGateConfig(
            min_duration_seconds=settings.quality_min_duration_seconds,
            min_goal_coverage=settings.quality_min_goal_coverage,
        ),
        quota_overrides={
            "free": settings.quota_free,
            "pro": settings.quota_pro,
            "team": settings.quota_team,
        },
    )
    return repo, gateway, service


def get_state(request: Request) -> AppState:
    return request.app.state.telepace


def get_harness(request: Request) -> Harness:
    return get_state(request).harness


def get_projector(request: Request) -> CampaignProjector:
    return get_state(request).projector


def get_settings_dep(request: Request) -> Settings:
    return get_state(request).settings


def build_orchestrator_for(
    state: AppState,
    *,
    org_id: UUID,
    author_id: UUID,
    run_id: UUID | None = None,
) -> OrchestratorAgent:
    """Construct a conversational agent scoped to one caller.

    The Orchestrator is per-request because tool calls that create resources
    must be attributed to the caller's org/author. Everything else (LLM,
    harness, projector, read services) is shared from AppState.
    """
    return OrchestratorAgent(
        llm=state.llm,  # type: ignore[arg-type]
        tool_handlers=TOOL_HANDLERS,
        harness=state.harness,
        projector=state.projector,
        insight_reader=state.insight_reader,
        followup_service=state.followup_service,
        org_id=org_id,
        author_id=author_id,
        public_base_url=state.settings.public_base_url,
        event_store=getattr(state, "event_store", None),
        artifact_store=getattr(state, "agent_artifacts", None),
        memory_store=getattr(state, "agent_memories", None),
        confirmation_store=getattr(
            state,
            "agent_confirmations",
            getattr(state, "agent_runs", None),
        ),
        run_id=run_id,
        compaction_model=getattr(state.settings, "llm_model_fast", None),
    )


def _build_email(settings: Settings) -> EmailDispatcher:
    provider = (settings.email_provider or "mock").lower()
    if provider == "resend" and settings.resend_api_key:
        return ResendEmail(
            api_key=settings.resend_api_key,
            from_address=settings.email_from,
            base_url=settings.resend_base_url,
            timeout=settings.channel_http_timeout_s,
            retry_attempts=settings.dispatch_retry_attempts,
            retry_base_delay_s=settings.dispatch_retry_base_delay_s,
        )
    return MockEmail(log_dir=settings.dispatch_log_dir)


def _build_sms(settings: Settings) -> SmsDispatcher:
    provider = (settings.sms_provider or "mock").lower()
    if (
        provider == "twilio"
        and settings.twilio_account_sid
        and settings.twilio_auth_token
        and settings.twilio_from
    ):
        return TwilioSMS(
            account_sid=settings.twilio_account_sid,
            auth_token=settings.twilio_auth_token,
            from_number=settings.twilio_from,
            base_url=settings.twilio_base_url,
            timeout=settings.channel_http_timeout_s,
            retry_attempts=settings.dispatch_retry_attempts,
            retry_base_delay_s=settings.dispatch_retry_base_delay_s,
        )
    return MockSMS(log_dir=settings.dispatch_log_dir)


def _build_phone(settings: Settings) -> PhoneDispatcher:
    provider = (settings.phone_provider or "mock").lower()
    if (
        provider == "vapi"
        and settings.vapi_api_key
        and settings.vapi_assistant_id
        and settings.vapi_phone_number_id
    ):
        return VapiPhone(
            api_key=settings.vapi_api_key,
            assistant_id=settings.vapi_assistant_id,
            phone_number_id=settings.vapi_phone_number_id,
            base_url=settings.vapi_base_url,
            timeout=settings.vapi_call_timeout_s,
            retry_attempts=settings.dispatch_retry_attempts,
            retry_base_delay_s=settings.dispatch_retry_base_delay_s,
        )
    return MockPhone(log_dir=settings.dispatch_log_dir)
