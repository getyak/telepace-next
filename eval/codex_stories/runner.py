"""Run ten real Codex CLI stories against the Telepace MCP server.

The runner launches Codex in a minimal temporary workspace with only the
Telepace MCP configured. Each story is judged from the raw Codex JSONL trace
plus Postgres/event-log/delivery-artifact readback. It never accepts the
assistant's final prose as proof of a side effect.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import asyncpg

from core.events import (
    InsightGenerated,
    InterviewCompleted,
    InterviewStarted,
    TurnRecorded,
)
from eval.codex_stories.scoreboard import (
    DEFAULT_RESULTS,
    DEFAULT_STORIES,
    StoryDefinition,
    evaluate_suite,
    load_definitions,
)
from interfaces.rest_api.auth.jwt import issue_token_pair
from interfaces.rest_api.config import Settings
from storage.event_store import PostgresEventStore
from storage.projections import CAMPAIGN_PROJECTION_SQL, CampaignProjector

RUNNER_VERSION = "1"
MUTATING_TOOLS = {
    "create_campaign",
    "refine_outline",
    "start_campaign",
    "dispatch_invites",
    "push_insights",
}


@dataclass(slots=True)
class SuiteContext:
    run_id: str
    marker: str
    org_id: UUID
    user_id: UUID
    email: str
    access_token: str
    campaign_id: UUID | None = None
    title: str = ""
    question: str = "What makes pricing hard to understand?"
    invite_addresses: tuple[str, str] = ("", "")
    delivery_address: str = ""
    interview_ids: tuple[UUID, UUID] | None = None
    quotes: tuple[str, str] = (
        "The pricing tiers are hard to compare.",
        "I could not tell which plan included automation.",
    )
    seeded: bool = False
    story_before: dict[str, Any] = field(default_factory=dict)


def _json_lines(text: str) -> tuple[list[dict[str, Any]], list[str]]:
    events: list[dict[str, Any]] = []
    errors: list[str] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            errors.append(f"line {line_number}: {exc}")
            continue
        if not isinstance(value, dict):
            errors.append(f"line {line_number}: expected object")
            continue
        events.append(value)
    return events, errors


def _completed_calls(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    calls = []
    for event in events:
        if event.get("type") != "item.completed":
            continue
        item = event.get("item")
        if isinstance(item, dict) and item.get("type") == "mcp_tool_call":
            calls.append(item)
    return calls


def _calls_named(calls: list[dict[str, Any]], name: str) -> list[dict[str, Any]]:
    return [
        call
        for call in calls
        if call.get("server") == "telepace" and call.get("tool") == name
    ]


def _tool_payload(call: dict[str, Any]) -> dict[str, Any]:
    result = call.get("result")
    if not isinstance(result, dict):
        return {}
    content = result.get("content")
    if not isinstance(content, list):
        return {}
    for item in content:
        if not isinstance(item, dict) or item.get("type") != "text":
            continue
        text = item.get("text")
        if not isinstance(text, str):
            continue
        try:
            value = json.loads(text)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    return {}


def _only_telepace_tools(events: list[dict[str, Any]], calls: list[dict[str, Any]]) -> bool:
    if any(call.get("server") != "telepace" for call in calls):
        return False
    for event in events:
        item = event.get("item")
        if not isinstance(item, dict):
            continue
        if item.get("type") in {
            "command_execution",
            "file_change",
            "web_search",
            "computer_use",
        }:
            return False
    return True


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    records = []
    for line in path.read_text().splitlines():
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            records.append(value)
    return records


async def _db_snapshot(
    settings: Settings,
    context: SuiteContext,
) -> dict[str, Any]:
    conn = await asyncpg.connect(settings.database_url)
    try:
        campaign_count = await conn.fetchval(
            "SELECT COUNT(*) FROM campaigns WHERE org_id=$1",
            context.org_id,
        )
        snapshot: dict[str, Any] = {"org_campaigns": int(campaign_count or 0)}
        if context.campaign_id is not None:
            cid = context.campaign_id
            row = await conn.fetchrow("SELECT * FROM campaigns WHERE id=$1", cid)
            snapshot["campaign"] = dict(row) if row is not None else None
            snapshot["events"] = int(
                await conn.fetchval(
                    "SELECT COUNT(*) FROM events WHERE campaign_id=$1",
                    cid,
                )
                or 0
            )
            rows = await conn.fetch(
                """
                SELECT type, payload, seq
                FROM events
                WHERE campaign_id=$1
                ORDER BY seq
                """,
                cid,
            )
            snapshot["event_rows"] = [dict(row) for row in rows]
            progress = await conn.fetchrow(
                "SELECT * FROM progress_snapshots WHERE campaign_id=$1",
                cid,
            )
            snapshot["progress"] = dict(progress) if progress is not None else None
        return snapshot
    finally:
        await conn.close()


def _payload_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _spec_from_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    campaign = snapshot.get("campaign")
    if not isinstance(campaign, dict):
        return {}
    return _payload_dict(campaign.get("spec"))


def _events_of(snapshot: dict[str, Any], event_type: str) -> list[dict[str, Any]]:
    rows = snapshot.get("event_rows")
    if not isinstance(rows, list):
        return []
    return [
        row
        for row in rows
        if isinstance(row, dict) and row.get("type") == event_type
    ]


async def _seed_collected_evidence(
    settings: Settings,
    context: SuiteContext,
) -> None:
    if context.seeded or context.campaign_id is None:
        return
    campaign_id = context.campaign_id
    interview_ids = (uuid4(), uuid4())
    context.interview_ids = interview_ids
    store = PostgresEventStore(
        settings.database_url,
        pool_min_size=1,
        pool_max_size=2,
        maintenance_interval_s=settings.event_store_maintenance_interval_s,
    )
    await store.start()
    pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=2)
    try:
        async with pool.acquire() as conn:
            await conn.execute(CAMPAIGN_PROJECTION_SQL)
        projector = CampaignProjector(pool)
        events = [
            InterviewStarted(
                campaign_id=campaign_id,
                actor="benchmark:fixture",
                interview_id=interview_ids[0],
            ),
            TurnRecorded(
                campaign_id=campaign_id,
                actor="benchmark:fixture",
                interview_id=interview_ids[0],
                order=1,
                role="respondent",
                text=context.quotes[0],
            ),
            InterviewCompleted(
                campaign_id=campaign_id,
                actor="benchmark:fixture",
                interview_id=interview_ids[0],
                duration_seconds=120,
                goal_coverage=0.8,
            ),
            InterviewStarted(
                campaign_id=campaign_id,
                actor="benchmark:fixture",
                interview_id=interview_ids[1],
            ),
            TurnRecorded(
                campaign_id=campaign_id,
                actor="benchmark:fixture",
                interview_id=interview_ids[1],
                order=1,
                role="respondent",
                text=context.quotes[1],
            ),
            InterviewCompleted(
                campaign_id=campaign_id,
                actor="benchmark:fixture",
                interview_id=interview_ids[1],
                duration_seconds=180,
                goal_coverage=0.6,
            ),
            InsightGenerated(
                campaign_id=campaign_id,
                actor="benchmark:fixture",
                insight_id=uuid4(),
                kind="theme",
                title="Pricing tiers are confusing",
                confidence=0.95,
                body={
                    "summary": "Both respondents found plan boundaries difficult to compare.",
                    "supporting_interview_ids": [str(value) for value in interview_ids],
                },
            ),
            InsightGenerated(
                campaign_id=campaign_id,
                actor="benchmark:fixture",
                insight_id=uuid4(),
                kind="concern",
                title="Automation entitlement is unclear",
                confidence=0.9,
                body={
                    "summary": "Respondents could not identify which plan includes automation.",
                    "supporting_interview_ids": [str(value) for value in interview_ids],
                },
            ),
        ]
        for event in events:
            stored = await store.append(event)
            await projector.apply(stored.seq, event)
        context.seeded = True
    finally:
        await store.stop()
        await pool.close()


def _prompt(story_id: str, context: SuiteContext) -> str:
    campaign_id = str(context.campaign_id) if context.campaign_id else "<missing-campaign>"
    prompts = {
        "CX-01": (
            "Use only the telepace MCP tools. Call get_session exactly once and report "
            "whether this is an authenticated Telepace session, including user_id, "
            "org_id, and scopes. Do not call any business mutation tool."
        ),
        "CX-02": (
            f'Use only telepace MCP tools. Create exactly one study titled "{context.title}" '
            'with goal "Understand pricing-plan comprehension and automation expectations", '
            'background "Codex ten-story acceptance run", target_completions 2, '
            'budget_usd 40, and channels ["email", "web_text"]. Then immediately call '
            "get_campaign_progress with the returned campaign_id. Do not retry creation."
        ),
        "CX-03": (
            f'Use only telepace MCP tools. Find the study titled "{context.title}" by '
            "calling list_campaigns with that exact title as query and limit at most 3. "
            f"Then call get_campaign_progress for campaign {campaign_id}. Report only the "
            "exact id, status, completed count, and target. Do not mutate anything."
        ),
        "CX-04": (
            f"Use only telepace MCP tools. For campaign {campaign_id}, call refine_outline "
            f'exactly once with instruction: Add the question "{context.question}". '
            "Do not publish, dispatch, or retry."
        ),
        "CX-05": (
            f"Use only telepace MCP tools. Publish campaign {campaign_id} exactly once with "
            "start_campaign, then call get_campaign_progress to verify the observed status "
            "is live. Do not call start_campaign a second time."
        ),
        "CX-06": (
            f"Use only telepace MCP tools. For campaign {campaign_id}, dispatch exactly two "
            f'email invitations, one to "{context.invite_addresses[0]}" and one to '
            f'"{context.invite_addresses[1]}". Then call get_campaign_progress and report '
            "the dispatched and invited counts. Do not retry dispatch."
        ),
        "CX-07": (
            f"Use only telepace MCP tools. Call get_campaign_progress exactly once for "
            f"campaign {campaign_id}. Report status, invited, started, completed, "
            "average duration, and average goal coverage. Do not mutate anything."
        ),
        "CX-08": (
            f"Use only telepace MCP tools. Call get_campaign_insights exactly once for "
            f"campaign {campaign_id}, format report, min_confidence 0.8. Report each "
            "insight with confidence and supporting interview ids. Do not mutate anything."
        ),
        "CX-09": (
            f"Use only telepace MCP tools. Call ask_followup exactly once for campaign "
            f"{campaign_id} with question \"What did respondents say about pricing and "
            "automation?\" and scope completed_only. Answer only from returned evidence "
            "and include cited interview ids. Do not mutate anything."
        ),
        "CX-10": (
            f"Use only telepace MCP tools. Push the verified insights from campaign "
            f"{campaign_id} exactly once to destination email with config target "
            f'"{context.delivery_address}". Report delivered and the external_ref. '
            "Do not claim success unless the tool returns both."
        ),
    }
    return f"Acceptance story {story_id}. {prompts[story_id]}"


def _codex_command(repo_root: Path, workspace: Path, prompt: str) -> list[str]:
    mcp_args = [
        "--directory",
        str(repo_root),
        "run",
        "python",
        "-m",
        "interfaces.mcp_server.server",
    ]
    return [
        "codex",
        "exec",
        "--ephemeral",
        "--json",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "-s",
        "read-only",
        "-C",
        str(workspace),
        "-c",
        'mcp_servers.telepace.command="uv"',
        "-c",
        f"mcp_servers.telepace.args={json.dumps(mcp_args)}",
        "-c",
        "mcp_servers.telepace.startup_timeout_sec=30",
        "-c",
        "mcp_servers.telepace.tool_timeout_sec=120",
        "-c",
        (
            "mcp_servers.telepace.env_vars="
            '["TELEPACE_MCP_ACCESS_TOKEN","TELEPACE_MCP_REQUIRE_AUTH"]'
        ),
        "-c",
        'mcp_servers.telepace.default_tools_approval_mode="approve"',
        prompt,
    ]


async def _run_codex(
    repo_root: Path,
    prompt: str,
    *,
    access_token: str,
    timeout_seconds: float,
) -> tuple[int, str, str, float]:
    env = os.environ.copy()
    env["TELEPACE_MCP_ACCESS_TOKEN"] = access_token
    env["TELEPACE_MCP_REQUIRE_AUTH"] = "true"
    with tempfile.TemporaryDirectory(prefix="telepace-codex-story-") as workspace_raw:
        workspace = Path(workspace_raw)
        started = time.perf_counter()
        proc = await asyncio.create_subprocess_exec(
            *_codex_command(repo_root, workspace, prompt),
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(),
                timeout=timeout_seconds,
            )
        except TimeoutError:
            proc.kill()
            stdout_bytes, stderr_bytes = await proc.communicate()
            stderr_bytes += b"\nbenchmark timeout"
            return 124, stdout_bytes.decode(errors="replace"), stderr_bytes.decode(
                errors="replace"
            ), time.perf_counter() - started
        return (
            int(proc.returncode or 0),
            stdout_bytes.decode(errors="replace"),
            stderr_bytes.decode(errors="replace"),
            time.perf_counter() - started,
        )


async def _judge(
    story: StoryDefinition,
    calls: list[dict[str, Any]],
    before: dict[str, Any],
    after: dict[str, Any],
    context: SuiteContext,
    settings: Settings,
) -> tuple[dict[str, bool], dict[str, Any]]:
    cid = str(context.campaign_id) if context.campaign_id else ""
    observations: dict[str, Any] = {}
    assertions = dict.fromkeys(story.assertions, False)

    if story.id == "CX-01":
        session_calls = _calls_named(calls, "get_session")
        payload = _tool_payload(session_calls[0]) if len(session_calls) == 1 else {}
        assertions.update(
            authenticated_session=payload.get("authenticated") is True,
            identity_matches_token=(
                payload.get("user_id") == str(context.user_id)
                and payload.get("org_id") == str(context.org_id)
                and payload.get("email") == context.email
            ),
            required_scopes_visible=set(payload.get("scopes", []))
            >= {"mcp:read", "mcp:write"},
            no_business_mutation=(
                before.get("org_campaigns") == after.get("org_campaigns")
                and not any(call.get("tool") in MUTATING_TOOLS for call in calls)
            ),
        )
        observations["session"] = payload

    elif story.id == "CX-02":
        create_calls = _calls_named(calls, "create_campaign")
        progress_calls = _calls_named(calls, "get_campaign_progress")
        created = _tool_payload(create_calls[0]) if len(create_calls) == 1 else {}
        progress = _tool_payload(progress_calls[0]) if len(progress_calls) == 1 else {}
        raw_cid = created.get("campaign_id")
        try:
            context.campaign_id = UUID(str(raw_cid))
        except (ValueError, TypeError):
            context.campaign_id = None
        refreshed = await _db_snapshot(settings, context)
        if context.campaign_id is not None:
            after.clear()
            after.update(refreshed)
        campaign = after.get("campaign")
        spec = _spec_from_snapshot(after)
        same_row = (
            isinstance(campaign, dict)
            and str(campaign.get("id")) == str(context.campaign_id)
            and campaign.get("title") == context.title
        )
        channel_kinds = {
            value.get("kind")
            for value in spec.get("channels", [])
            if isinstance(value, dict)
        }
        assertions.update(
            exactly_one_campaign_created=(
                len(create_calls) == 1
                and after.get("org_campaigns", 0) == before.get("org_campaigns", 0) + 1
            ),
            durable_campaign_matches_request=(
                same_row
                and spec.get("goal")
                == "Understand pricing-plan comprehension and automation expectations"
                and spec.get("target_completions") == 2
                and float(spec.get("budget_usd", -1)) == 40.0
                and channel_kinds == {"email", "web_text"}
            ),
            immediate_progress_readback=(
                len(progress_calls) == 1
                and progress.get("campaign_id") == str(context.campaign_id)
                and progress.get("status") == "draft"
                and progress.get("completed") == 0
                and float(progress.get("budget_usd", -1)) == 40.0
            ),
            no_duplicate_side_effect=(
                len(create_calls) == 1 and len(_events_of(after, "study.drafted")) == 1
            ),
        )
        observations.update(created=created, progress=progress, campaign_id=raw_cid)

    elif story.id == "CX-03":
        list_calls = _calls_named(calls, "list_campaigns")
        progress_calls = _calls_named(calls, "get_campaign_progress")
        list_call = list_calls[0] if len(list_calls) == 1 else {}
        listing = _tool_payload(list_call)
        campaigns = listing.get("campaigns", [])
        if not isinstance(campaigns, list):
            campaigns = []
        progress = _tool_payload(progress_calls[0]) if len(progress_calls) == 1 else {}
        args = list_call.get("arguments", {})
        if not isinstance(args, dict):
            args = {}
        assertions.update(
            bounded_title_search=(
                len(list_calls) == 1
                and args.get("query") == context.title
                and 1 <= int(args.get("limit", 999)) <= 3
                and len(campaigns) <= 3
            ),
            exact_campaign_found=(
                len(campaigns) == 1
                and campaigns[0].get("campaign_id") == cid
                and campaigns[0].get("title") == context.title
            ),
            progress_matches_projection=(
                len(progress_calls) == 1
                and progress.get("campaign_id") == cid
                and progress.get("status") == "draft"
                and progress.get("completed") == 0
            ),
            no_business_mutation=(
                before.get("events") == after.get("events")
                and not any(call.get("tool") in MUTATING_TOOLS for call in calls)
            ),
        )
        observations.update(list_result=listing, progress=progress)

    elif story.id == "CX-04":
        refine_calls = _calls_named(calls, "refine_outline")
        spec = _spec_from_snapshot(after)
        outline = spec.get("outline", {})
        items = outline.get("items", []) if isinstance(outline, dict) else []
        before_campaign = before.get("campaign")
        after_campaign = after.get("campaign")
        before_version = (
            int(before_campaign.get("version", 0))
            if isinstance(before_campaign, dict)
            else 0
        )
        after_version = (
            int(after_campaign.get("version", 0))
            if isinstance(after_campaign, dict)
            else 0
        )
        assertions.update(
            exactly_one_refine=len(refine_calls) == 1,
            requested_question_persisted=any(
                isinstance(item, dict) and item.get("question") == context.question
                for item in items
            ),
            projection_advanced_once=after_version == before_version + 1,
            no_duplicate_side_effect=(
                len(_events_of(after, "study.spec_updated"))
                == len(_events_of(before, "study.spec_updated")) + 1
            ),
        )
        observations.update(
            version_before=before_version,
            version_after=after_version,
            questions=[
                item.get("question") for item in items if isinstance(item, dict)
            ],
        )

    elif story.id == "CX-05":
        start_calls = _calls_named(calls, "start_campaign")
        progress_calls = _calls_named(calls, "get_campaign_progress")
        progress = _tool_payload(progress_calls[0]) if len(progress_calls) == 1 else {}
        campaign = after.get("campaign")
        assertions.update(
            exactly_one_publish=len(start_calls) == 1,
            status_live_readback=(
                len(progress_calls) == 1
                and progress.get("campaign_id") == cid
                and progress.get("status") == "live"
                and isinstance(campaign, dict)
                and campaign.get("status") == "live"
            ),
            published_event_persisted=(
                len(_events_of(after, "study.published"))
                == len(_events_of(before, "study.published")) + 1
            ),
            no_duplicate_side_effect=len(_events_of(after, "study.published")) == 1,
        )
        observations["progress"] = progress

    elif story.id == "CX-06":
        dispatch_calls = _calls_named(calls, "dispatch_invites")
        progress_calls = _calls_named(calls, "get_campaign_progress")
        dispatched = _tool_payload(dispatch_calls[0]) if len(dispatch_calls) == 1 else {}
        progress = _tool_payload(progress_calls[0]) if len(progress_calls) == 1 else {}
        invite_events = _events_of(after, "invite.dispatched")
        raw_event_text = json.dumps(invite_events)
        email_records = _read_jsonl(Path(settings.dispatch_log_dir) / "email.jsonl")
        matches = [
            row
            for row in email_records
            if row.get("to") in context.invite_addresses
            and cid in str(row.get("share_url", ""))
        ]
        assertions.update(
            exactly_two_invites_dispatched=(
                len(dispatch_calls) == 1
                and dispatched.get("dispatched") == 2
                and len(invite_events) == 2
            ),
            progress_invited_two=(
                len(progress_calls) == 1 and progress.get("invited") == 2
            ),
            addresses_redacted_in_events=(
                all(address not in raw_event_text for address in context.invite_addresses)
                and all(
                    len(str(_payload_dict(row.get("payload")).get("address_hash", "")))
                    == 16
                    for row in invite_events
                )
            ),
            delivery_artifacts_exist=(
                {row.get("to") for row in matches} == set(context.invite_addresses)
                and all(row.get("provider_id") for row in matches)
            ),
        )
        observations.update(
            dispatch=dispatched,
            progress=progress,
            matching_delivery_artifacts=len(matches),
        )

    elif story.id == "CX-07":
        progress_calls = _calls_named(calls, "get_campaign_progress")
        progress = _tool_payload(progress_calls[0]) if len(progress_calls) == 1 else {}
        assertions.update(
            progress_counts_match_truth=(
                len(progress_calls) == 1
                and progress.get("invited") == 2
                and progress.get("started") == 2
                and progress.get("completed") == 2
                and progress.get("abandoned") == 0
            ),
            averages_match_truth=(
                abs(float(progress.get("avg_duration_seconds", -1)) - 150.0) < 0.001
                and abs(float(progress.get("avg_goal_coverage", -1)) - 0.7) < 0.001
            ),
            lifecycle_remains_live=progress.get("status") == "live",
            no_business_mutation=(
                before.get("events") == after.get("events")
                and not any(call.get("tool") in MUTATING_TOOLS for call in calls)
            ),
        )
        observations["progress"] = progress

    elif story.id == "CX-08":
        insight_calls = _calls_named(calls, "get_campaign_insights")
        call = insight_calls[0] if len(insight_calls) == 1 else {}
        payload = _tool_payload(call)
        items = payload.get("items", [])
        if not isinstance(items, list):
            items = []
        args = call.get("arguments", {})
        if not isinstance(args, dict):
            args = {}
        expected_ids = {str(value) for value in context.interview_ids or ()}
        cited_ids = {
            str(value)
            for item in items
            if isinstance(item, dict)
            for value in item.get("supporting_interview_ids", [])
        }
        assertions.update(
            report_insight_returned=(
                len(insight_calls) == 1
                and {item.get("kind") for item in items if isinstance(item, dict)}
                == {"theme", "concern"}
            ),
            confidence_filter_honored=(
                args.get("format") == "report"
                and float(args.get("min_confidence", -1)) == 0.8
                and bool(items)
                and all(
                    float(item.get("confidence", 0)) >= 0.8
                    for item in items
                    if isinstance(item, dict)
                )
            ),
            supporting_interviews_cited=cited_ids == expected_ids,
            no_business_mutation=(
                before.get("events") == after.get("events")
                and not any(call.get("tool") in MUTATING_TOOLS for call in calls)
            ),
        )
        observations["insights"] = payload

    elif story.id == "CX-09":
        followup_calls = _calls_named(calls, "ask_followup")
        payload = _tool_payload(followup_calls[0]) if len(followup_calls) == 1 else {}
        evidence = payload.get("evidence", [])
        if not isinstance(evidence, list):
            evidence = []
        evidence_quotes = {
            str(item.get("quote", ""))
            for item in evidence
            if isinstance(item, dict)
        }
        cited = " ".join(
            str(item.get("interview_ids", ""))
            for item in evidence
            if isinstance(item, dict)
        )
        assertions.update(
            followup_answer_nonempty=(
                len(followup_calls) == 1
                and bool(str(payload.get("answer", "")).strip())
                and "not enough" not in str(payload.get("answer", "")).lower()
            ),
            evidence_contains_real_quote=bool(
                evidence_quotes.intersection(context.quotes)
            ),
            evidence_cites_interview=all(
                str(value) in cited for value in context.interview_ids or ()
            ),
            no_business_mutation=(
                before.get("events") == after.get("events")
                and not any(call.get("tool") in MUTATING_TOOLS for call in calls)
            ),
        )
        observations["followup"] = payload

    elif story.id == "CX-10":
        push_calls = _calls_named(calls, "push_insights")
        payload = _tool_payload(push_calls[0]) if len(push_calls) == 1 else {}
        ref = str(payload.get("external_ref") or "")
        provider_id = ref.split(":", 1)[1] if ":" in ref else ""
        notifications = _events_of(after, "coord.notification_sent")
        email_records = _read_jsonl(Path(settings.dispatch_log_dir) / "email.jsonl")
        matching_artifacts = [
            row
            for row in email_records
            if row.get("to") == context.delivery_address
            and row.get("provider_id") == provider_id
            and f"/studies/{cid}/insights" in str(row.get("share_url", ""))
        ]
        notification_payloads = [
            _payload_dict(row.get("payload")) for row in notifications
        ]
        assertions.update(
            delivery_reported_true=(
                len(push_calls) == 1 and payload.get("delivered") is True
            ),
            external_reference_returned=(
                ref.startswith("mock:") and len(provider_id) >= 16
            ),
            notification_event_persisted=(
                len(notifications)
                == len(_events_of(before, "coord.notification_sent")) + 1
                and any(
                    value.get("channel") == "email"
                    and value.get("to") != context.delivery_address
                    for value in notification_payloads
                )
            ),
            delivery_artifact_verified=len(matching_artifacts) == 1,
        )
        observations.update(
            delivery=payload,
            matching_delivery_artifacts=len(matching_artifacts),
        )

    return assertions, observations


def _source_digest(repo_root: Path) -> str:
    digest = hashlib.sha256()
    roots = (
        repo_root / "agents",
        repo_root / "core",
        repo_root / "harness",
        repo_root / "interfaces",
        repo_root / "storage",
        repo_root / "eval" / "codex_stories",
        repo_root / "eval" / "datasets" / "codex_stories",
    )
    for root in roots:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*")):
            if not path.is_file() or "__pycache__" in path.parts:
                continue
            digest.update(path.relative_to(repo_root).as_posix().encode())
            digest.update(path.read_bytes())
    return digest.hexdigest()


async def run_suite(
    *,
    repo_root: Path,
    stories_path: Path = DEFAULT_STORIES,
    results_dir: Path = DEFAULT_RESULTS,
    timeout_seconds: float = 240.0,
) -> Path:
    _minimum_score, stories = load_definitions(stories_path)
    settings = Settings()
    now = datetime.now(UTC)
    suffix = uuid4().hex[:10]
    run_id = f"{now.strftime('%Y%m%dT%H%M%SZ')}-{suffix}"
    marker = f"CODEX-{suffix.upper()}"
    user_id = uuid4()
    org_id = uuid4()
    email = f"codex-{suffix}@example.test"
    token_pair = issue_token_pair(
        user_id=user_id,
        org_id=org_id,
        email=email,
        scopes=["mcp:read", "mcp:write"],
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        access_ttl_seconds=max(3600, int(timeout_seconds * 12)),
        refresh_ttl_seconds=7200,
        issuer=settings.jwt_issuer,
        audience=settings.jwt_audience,
    )
    context = SuiteContext(
        run_id=run_id,
        marker=marker,
        org_id=org_id,
        user_id=user_id,
        email=email,
        access_token=token_pair.access_token,
        title=f"{marker} Pricing comprehension",
        invite_addresses=(
            f"participant-a-{suffix}@example.test",
            f"participant-b-{suffix}@example.test",
        ),
        delivery_address=f"researcher-{suffix}@example.test",
    )
    run_dir = results_dir / run_id
    trace_dir = run_dir / "traces"
    trace_dir.mkdir(parents=True, exist_ok=False)
    records: list[dict[str, Any]] = []

    for story in stories:
        if story.id == "CX-07":
            await _seed_collected_evidence(settings, context)
        before = await _db_snapshot(settings, context)
        prompt = _prompt(story.id, context)
        started_at = datetime.now(UTC).isoformat()
        exit_code, stdout, stderr, duration = await _run_codex(
            repo_root,
            prompt,
            access_token=context.access_token,
            timeout_seconds=timeout_seconds,
        )
        trace_path = trace_dir / f"{story.id}.jsonl"
        trace_path.write_text(stdout)
        stderr_path = trace_dir / f"{story.id}.stderr.log"
        stderr_path.write_text(stderr)
        events, parse_errors = _json_lines(stdout)
        calls = _completed_calls(events)
        after = await _db_snapshot(settings, context)
        assertions, observations = await _judge(
            story,
            calls,
            before,
            after,
            context,
            settings,
        )
        call_errors = [
            {
                "tool": call.get("tool"),
                "error": call.get("error"),
                "status": call.get("status"),
            }
            for call in calls
            if call.get("error") or call.get("status") != "completed"
        ]
        only_telepace = _only_telepace_tools(events, calls)
        hard_failure = bool(parse_errors or call_errors)
        trace_digest = hashlib.sha256(trace_path.read_bytes()).hexdigest()
        record = {
            "id": story.id,
            "title": story.title,
            "prompt": prompt,
            "started_at": started_at,
            "duration_seconds": round(duration, 3),
            "exit_code": exit_code,
            "tools_used": [str(call.get("tool")) for call in calls],
            "assertions": assertions,
            "observations": observations,
            "safety": {
                "hard_failure": hard_failure,
                "only_telepace_tools": only_telepace,
                "parse_errors": parse_errors,
                "tool_errors": call_errors,
            },
            "trace_path": trace_path.relative_to(run_dir).as_posix(),
            "trace_sha256": trace_digest,
            "stderr_path": stderr_path.relative_to(run_dir).as_posix(),
        }
        records.append(record)
        passed_count = sum(assertions.values())
        print(
            f"{story.id}: exit={exit_code} assertions={passed_count}/{len(assertions)} "
            f"tools={record['tools_used']} duration={duration:.1f}s",
            flush=True,
        )

    try:
        codex_version = subprocess.run(
            ["codex", "--version"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        codex_version = "unknown"
    suite = {
        "run_id": run_id,
        "runner_version": RUNNER_VERSION,
        "story_set_version": 1,
        "created_at": now.isoformat(),
        "codex_version": codex_version,
        "source_digest": _source_digest(repo_root),
        "fixture": {
            "org_id": str(context.org_id),
            "user_id": str(context.user_id),
            "campaign_id": str(context.campaign_id) if context.campaign_id else None,
            "interview_ids": [
                str(value) for value in context.interview_ids or ()
            ],
            "marker": context.marker,
        },
        "stories": records,
    }
    (run_dir / "suite.json").write_text(
        json.dumps(suite, ensure_ascii=False, indent=2, default=str) + "\n"
    )
    results_dir.mkdir(parents=True, exist_ok=True)
    (results_dir / "latest.json").write_text(
        json.dumps({"run_id": run_id}, indent=2) + "\n"
    )
    evaluated = evaluate_suite(run_dir, stories_path=stories_path)
    print(
        f"suite {run_id}: {'PASS' if evaluated.passed else 'FAIL'} "
        f"({sum(story.passed for story in evaluated.stories)}/10)",
        flush=True,
    )
    return run_dir


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stories", type=Path, default=DEFAULT_STORIES)
    parser.add_argument("--results-dir", type=Path, default=DEFAULT_RESULTS)
    parser.add_argument("--timeout-seconds", type=float, default=240.0)
    parser.add_argument("--require-pass", action="store_true")
    args = parser.parse_args(argv)
    repo_root = Path(__file__).resolve().parents[2]
    try:
        run_dir = asyncio.run(
            run_suite(
                repo_root=repo_root,
                stories_path=args.stories,
                results_dir=args.results_dir,
                timeout_seconds=args.timeout_seconds,
            )
        )
        suite = evaluate_suite(run_dir, stories_path=args.stories)
    except (OSError, RuntimeError, ValueError, asyncpg.PostgresError) as exc:
        print(f"codex-stories runner: {exc}", file=sys.stderr)
        return 2
    print(f"evidence: {run_dir}")
    if args.require_pass and not suite.passed:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
