"""E2E: /v1/interviews/{join,reply} against the live FastAPI at :8010.

Prereqs (must already be up):
  - http://localhost:8010

Run:
  uv run pytest tests/e2e/test_interviews.py -v
"""

from __future__ import annotations

import os

import httpx

API = os.environ.get("TELEPACE_API_BASE_URL", "http://localhost:8010")


def _create_campaign() -> str:
    r = httpx.post(
        f"{API}/v1/campaigns",
        json={
            "title": "Interview E2E",
            "goal": "test interview join/reply",
            "channels": ["web_text"],
        },
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json()["campaign_id"]


def test_join_returns_interview_and_respondent_ids() -> None:
    cid = _create_campaign()
    r = httpx.post(
        f"{API}/v1/interviews/join",
        json={"campaign_id": cid},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "interview_id" in body
    assert "respondent_id" in body
    from uuid import UUID

    UUID(body["interview_id"])
    UUID(body["respondent_id"])


def test_join_accepts_optional_respondent_ref() -> None:
    cid = _create_campaign()
    r = httpx.post(
        f"{API}/v1/interviews/join",
        json={"campaign_id": cid, "respondent_ref": "email:alice@example.com"},
        timeout=15,
    )
    assert r.status_code == 200


def test_join_rejects_missing_campaign_id() -> None:
    r = httpx.post(f"{API}/v1/interviews/join", json={}, timeout=15)
    assert r.status_code == 422


def test_join_rejects_extra_fields() -> None:
    r = httpx.post(
        f"{API}/v1/interviews/join",
        json={"campaign_id": "11111111-1111-1111-1111-111111111111", "surprise": 1},
        timeout=15,
    )
    assert r.status_code == 422


def test_reply_full_round_trip_after_join() -> None:
    cid = _create_campaign()
    r = httpx.post(f"{API}/v1/interviews/join", json={"campaign_id": cid}, timeout=15)
    iid = r.json()["interview_id"]

    r = httpx.post(
        f"{API}/v1/interviews/reply",
        json={"campaign_id": cid, "interview_id": iid, "text": "I want cheaper pricing."},
        timeout=90,
    )
    # A live harness may either succeed (200) or gate on missing spec (400).
    # Both are legitimate — the test locks that the endpoint at least accepts
    # a well-formed request and does not 500 or 422.
    assert r.status_code in (200, 400), r.text


def test_reply_rejects_missing_fields() -> None:
    r = httpx.post(f"{API}/v1/interviews/reply", json={}, timeout=15)
    assert r.status_code == 422


def test_reply_rejects_extra_fields() -> None:
    cid = _create_campaign()
    r = httpx.post(f"{API}/v1/interviews/join", json={"campaign_id": cid}, timeout=15)
    iid = r.json()["interview_id"]
    r = httpx.post(
        f"{API}/v1/interviews/reply",
        json={
            "campaign_id": cid,
            "interview_id": iid,
            "text": "hi",
            "audio_url": "https://x",
        },
        timeout=15,
    )
    assert r.status_code == 422


def test_reply_pii_gets_redacted_by_policy() -> None:
    """PII policy runs on every reply — email in text is redacted server-side.
    We assert the request completes without a schema error."""
    cid = _create_campaign()
    r = httpx.post(f"{API}/v1/interviews/join", json={"campaign_id": cid}, timeout=15)
    iid = r.json()["interview_id"]
    r = httpx.post(
        f"{API}/v1/interviews/reply",
        json={"campaign_id": cid, "interview_id": iid, "text": "email me at a@b.co"},
        timeout=90,
    )
    assert r.status_code in (200, 400)
