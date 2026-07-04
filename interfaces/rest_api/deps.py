"""FastAPI dependency wiring: app singletons for Harness, Projector, EventStore."""

from __future__ import annotations

from dataclasses import dataclass

import asyncpg
import redis.asyncio as redis
from fastapi import Request

from agents.analyst import AnalystAgent
from agents.coordinator import CoordinatorAgent
from agents.designer import DesignerAgent
from agents.interviewer import InterviewerAgent
from agents.shared import build_llm_from_settings
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
from interfaces.rest_api.auth.users_repo import USERS_SCHEMA_SQL, UsersRepo
from interfaces.rest_api.config import Settings, get_settings
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
    projector = CampaignProjector(pool)
    users_repo = UsersRepo(pool)

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
            "coordinator": CoordinatorAgent(),
            "dispatch": dispatch_handler,
        },
        tracer=NullTracer(),
    )

    return AppState(
        settings=settings,
        event_store=store,
        pool=pool,
        projector=projector,
        harness=harness,
        analyst=AnalystAgent(
            llm=llm,
            max_tokens=settings.analyst_max_tokens,
            temperature=settings.analyst_temperature,
        ),
        email_dispatcher=email_dispatcher,
        sms_dispatcher=sms_dispatcher,
        phone_dispatcher=phone_dispatcher,
        users_repo=users_repo,
        llm=llm,
        memory=memory,
    )


def get_state(request: Request) -> AppState:
    return request.app.state.telepace


def get_harness(request: Request) -> Harness:
    return get_state(request).harness


def get_projector(request: Request) -> CampaignProjector:
    return get_state(request).projector


def get_settings_dep(request: Request) -> Settings:
    return get_state(request).settings


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
