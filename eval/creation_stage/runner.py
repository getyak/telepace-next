"""HTTP runner for creation-stage evaluation.

Drives the live telepace backend (default http://localhost:8010) for one Story.
Registers a throwaway user, calls POST /v1/campaigns, GET /v1/campaigns/{id},
and POST /v1/campaigns/{id}/simulate. Collects timings so the efficiency
judge can score without any Playwright driver.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx

from eval.creation_stage.stories import Story


@dataclass
class RunArtifact:
    story_id: str
    ok: bool
    create_ms: float = 0.0
    get_ms: float = 0.0
    simulate_ms: float = 0.0
    spec: dict[str, Any] = field(default_factory=dict)
    simulation: dict[str, Any] = field(default_factory=dict)
    error: str = ""
    campaign_id: str = ""


async def _register_user(client: httpx.AsyncClient, base: str) -> str:
    email = f"eval-{uuid.uuid4().hex[:12]}@telepace.dev"
    r = await client.post(
        f"{base}/auth/register",
        json={"email": email, "password": "evalevaleval12"},
    )
    r.raise_for_status()
    return r.json()["access_token"]


async def run_story(
    story: Story,
    base: str = "http://localhost:8010",
    timeout_s: float = 300.0,
) -> RunArtifact:
    """Execute one story end-to-end and return an artifact for judging."""
    art = RunArtifact(story_id=story.id, ok=False)
    async with httpx.AsyncClient(
        timeout=timeout_s, trust_env=False, follow_redirects=True
    ) as client:
        try:
            token = await _register_user(client, base)
        except Exception as exc:
            art.error = f"register failed: {exc}"
            return art
        headers = {"Authorization": f"Bearer {token}"}

        t0 = time.perf_counter()
        try:
            r = await client.post(
                f"{base}/v1/campaigns",
                headers=headers,
                json={
                    "title": story.title,
                    "goal": story.goal,
                    "background": story.background,
                    "target_completions": story.target_completions,
                    "budget_usd": story.budget_usd,
                    "channels": story.channels,
                },
            )
        except Exception as exc:
            art.error = f"create request failed: {exc}"
            return art
        art.create_ms = (time.perf_counter() - t0) * 1000
        if r.status_code != 200:
            art.error = f"create {r.status_code}: {r.text[:300]}"
            return art
        art.campaign_id = r.json()["campaign_id"]

        t1 = time.perf_counter()
        r2 = await client.get(f"{base}/v1/campaigns/{art.campaign_id}", headers=headers)
        art.get_ms = (time.perf_counter() - t1) * 1000
        if r2.status_code != 200:
            art.error = f"get {r2.status_code}: {r2.text[:300]}"
            return art
        art.spec = r2.json().get("campaign", {}).get("spec", {})

        outline_items = (art.spec.get("outline") or {}).get("items", [])
        if not outline_items:
            art.error = "outline is empty; nothing to simulate"
            return art

        t2 = time.perf_counter()
        try:
            r3 = await client.post(
                f"{base}/v1/campaigns/{art.campaign_id}/simulate",
                headers=headers,
                json={},
            )
        except Exception as exc:
            art.error = f"simulate request failed: {exc}"
            return art
        art.simulate_ms = (time.perf_counter() - t2) * 1000
        if r3.status_code != 200:
            art.error = f"simulate {r3.status_code}: {r3.text[:300]}"
            return art
        art.simulation = r3.json()

        art.ok = True
        return art


async def run_all(
    stories: list[Story],
    base: str = "http://localhost:8010",
    concurrency: int = 3,
) -> list[RunArtifact]:
    """Run every story with bounded concurrency."""
    sem = asyncio.Semaphore(concurrency)

    async def _one(s: Story) -> RunArtifact:
        async with sem:
            return await run_story(s, base=base)

    return await asyncio.gather(*(_one(s) for s in stories))
