"""Full-stack E2E: FastAPI + 3 Next apps + real chromium.

Prereqs (all must already be up):
  - http://localhost:8010  (FastAPI)
  - http://localhost:3300  (marketing)
  - http://localhost:3011  (app)
  - http://localhost:3012  (respondent)

Run:
  uv run pytest tests/e2e/test_full_stack.py -v -s
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import httpx
import pytest
from playwright.sync_api import Page, expect, sync_playwright

API = os.environ.get("TELEPACE_API_BASE_URL", "http://localhost:8010")
MARKETING = os.environ.get("TELEPACE_MARKETING_URL", "http://localhost:3300")
APP = os.environ.get("TELEPACE_APP_URL", "http://localhost:3011")
RESPONDENT = os.environ.get("TELEPACE_RESPONDENT_URL", "http://localhost:3012")

SHOTS = Path(__file__).resolve().parents[2] / "data" / "e2e_screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

MARKETING_ROUTES = [
    "/",
    "/pricing",
    "/demo",
    "/mcp",
    "/product/voice",
    "/product/agent",
    "/docs",
    "/customers",
    "/changelog",
    "/careers",
    "/security",
    "/privacy",
    "/terms",
    "/login",
    "/signup",
]

APP_ROUTES = [
    "/",
    "/inbox",
    "/audience",
    "/insights",
    "/integrations",
    "/settings",
    "/studies/new",
    "/studies/01",
]


def test_api_health() -> None:
    r = httpx.get(f"{API}/healthz", timeout=5)
    assert r.status_code == 200
    r = httpx.get(f"{API}/readyz", timeout=5)
    assert r.status_code == 200


def test_api_campaign_full_lifecycle() -> None:
    """Create → Refine (non-stream) → Start → Dispatch → Reply. Real Harness."""
    body = {
        "title": "E2E pricing tier study",
        "goal": "Decide $49 vs $99 for our PM SaaS",
        "target_completions": 5,
        "budget_usd": 20.0,
        "channels": ["email"],
    }
    r = httpx.post(f"{API}/v1/campaigns", json=body, timeout=30)
    assert r.status_code == 200, r.text
    cid = r.json()["campaign_id"]
    assert r.json()["status"] == "draft"

    r = httpx.post(
        f"{API}/v1/campaigns/{cid}/refine",
        json={"instruction": "Add a pricing sensitivity question."},
        timeout=60,
    )
    assert r.status_code == 200, r.text
    assert "patch" in r.json()

    r = httpx.post(f"{API}/v1/campaigns/{cid}/start", timeout=10)
    assert r.status_code == 200, r.text

    r = httpx.post(
        f"{API}/v1/campaigns/{cid}/dispatch",
        json={
            "invites": [
                {"address": "e2e@example.com", "channel": "email"},
                {"address": "+15550001", "channel": "sms"},
                {"address": "+15550002", "channel": "phone_outbound"},
            ]
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["sent"] == 3, result


def test_api_sse_refine_stream() -> None:
    """SSE variant: expect delta + spec_patch + done events."""
    r = httpx.post(
        f"{API}/v1/campaigns",
        json={"title": "SSE test", "goal": "test streaming", "channels": ["email"]},
        timeout=30,
    )
    cid = r.json()["campaign_id"]

    events: list[dict] = []
    with httpx.stream(
        "POST",
        f"{API}/v1/campaigns/{cid}/refine/stream",
        json={"instruction": "Add a competitor comparison question."},
        timeout=60,
    ) as s:
        for line in s.iter_lines():
            if not line or not line.startswith("data:"):
                continue
            events.append(json.loads(line[5:].strip()))
            if events[-1].get("type") in {"done", "error"}:
                break
    kinds = {e["type"] for e in events}
    assert "delta" in kinds or "spec_patch" in kinds, events
    assert "done" in kinds, events


@pytest.fixture(scope="module")
def browser_ctx():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        yield ctx
        ctx.close()
        browser.close()


@pytest.mark.parametrize("path", MARKETING_ROUTES)
def test_marketing_pages(browser_ctx, path: str) -> None:
    page = browser_ctx.new_page()
    resp = page.goto(f"{MARKETING}{path}", wait_until="domcontentloaded", timeout=120000)
    assert resp is not None and resp.status == 200, f"{path} → {resp}"
    body_text = page.locator("body").inner_text()
    assert len(body_text.strip()) > 50, f"{path} body seems empty"
    slug = path.strip("/").replace("/", "_") or "home"
    page.screenshot(path=str(SHOTS / f"marketing_{slug}.png"))
    page.close()


@pytest.mark.parametrize("path", APP_ROUTES)
def test_app_pages(browser_ctx, path: str) -> None:
    page = browser_ctx.new_page()
    # domcontentloaded (not networkidle) — /studies/new keeps an SSE stream
    # open which would starve networkidle indefinitely.
    resp = page.goto(f"{APP}{path}", wait_until="domcontentloaded", timeout=120000)
    assert resp is not None and resp.status == 200, f"{path} → {resp}"
    body_text = page.locator("body").inner_text()
    assert len(body_text.strip()) > 30, f"{path} body seems empty"
    slug = path.strip("/").replace("/", "_") or "home"
    page.screenshot(path=str(SHOTS / f"app_{slug}.png"))
    page.close()


def test_chat_to_build_flow(browser_ctx) -> None:
    """Real chat-to-build: type a goal, expect Designer to draft an outline."""
    page: Page = browser_ctx.new_page()
    page.goto(f"{APP}/studies/new", wait_until="domcontentloaded", timeout=120000)
    composer = page.get_by_placeholder("Describe what you want to learn…")
    expect(composer).to_be_visible()
    composer.fill("I want to interview 5 PMs about pricing sensitivity for our SaaS tool.")
    composer.press("Enter")
    page.wait_for_selector("text=/outline/i", timeout=45000)
    page.screenshot(path=str(SHOTS / "chat_to_build_after_send.png"), full_page=True)
    outline_pane = page.locator("section").nth(1)
    expect(outline_pane).to_contain_text("Discussion guide")
    page.close()


def test_respondent_link_renders(browser_ctx) -> None:
    """Create a campaign via API, open the respondent page, click Start."""
    r = httpx.post(
        f"{API}/v1/campaigns",
        json={
            "title": "Respondent E2E",
            "goal": "test respondent link",
            "channels": ["web_text"],
        },
        timeout=30,
    )
    cid = r.json()["campaign_id"]

    page = browser_ctx.new_page()
    # Retry once on macOS chromium App Nap IO_SUSPENDED after long test batches.
    for attempt in range(2):
        try:
            page.goto(f"{RESPONDENT}/r/{cid}", wait_until="domcontentloaded", timeout=120000)
            break
        except Exception as exc:
            if "ERR_NETWORK_IO_SUSPENDED" in str(exc) and attempt == 0:
                page.close()
                page = browser_ctx.new_page()
                continue
            raise
    expect(page.get_by_text("Thanks for being here.")).to_be_visible(timeout=10000)
    console_msgs: list[str] = []
    page.on("console", lambda msg: console_msgs.append(f"{msg.type}: {msg.text}"))
    page.on("pageerror", lambda err: console_msgs.append(f"pageerror: {err}"))
    start_btn = page.get_by_role("button", name="Start with text")
    expect(start_btn).to_be_enabled(timeout=10000)
    # Retry click up to 3x — Next.js client bundle can attach handlers
    # after DOMContentLoaded, so an early click gets swallowed.
    for attempt in range(3):
        start_btn.click()
        try:
            page.wait_for_selector("textarea", state="attached", timeout=5000)
            break
        except Exception:
            if attempt == 2:
                page.screenshot(path=str(SHOTS / "respondent_stuck.png"))
                raise AssertionError(
                    "textarea never mounted after Start-with-text click; console: "
                    + "\n".join(console_msgs[-10:])
                )
    page.screenshot(path=str(SHOTS / "respondent_text_mode.png"))
    page.close()
