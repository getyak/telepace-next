"""Resend email dispatcher — thin HTTP wrapper, no SDK."""

from __future__ import annotations

import logging

import httpx

from core.constants import HTTP_ERROR_MSG_MAX
from interfaces.channels.base import DispatchReceipt, Invite, retry

logger = logging.getLogger(__name__)


class ResendEmail:
    provider_name = "resend"

    def __init__(
        self,
        *,
        api_key: str,
        from_address: str,
        base_url: str,
        timeout: float,
        retry_attempts: int,
        retry_base_delay_s: float,
    ) -> None:
        self._api_key = api_key
        self._from = from_address
        self._endpoint = f"{base_url.rstrip('/')}/emails"
        self._timeout = timeout
        self._retry_attempts = retry_attempts
        self._retry_base_delay_s = retry_base_delay_s

    async def send(
        self,
        invite: Invite,
        subject: str,
        body_html: str,
        body_text: str,
    ) -> DispatchReceipt:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "from": self._from,
            "to": [invite.address],
            "subject": subject,
            "html": body_html,
            "text": body_text,
        }

        async def _do() -> httpx.Response:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                r = await client.post(self._endpoint, headers=headers, json=payload)
                if r.status_code >= 500:
                    raise Exception(f"resend 5xx: {r.status_code}")
                return r

        try:
            resp = await retry(
                _do, attempts=self._retry_attempts, base_delay=self._retry_base_delay_s
            )
        except Exception as exc:  # network/timeout/5xx after retries
            return DispatchReceipt(
                ok=False, provider="resend", provider_id=None, error=str(exc)
            )

        if resp.status_code >= 400:
            return DispatchReceipt(
                ok=False,
                provider="resend",
                provider_id=None,
                error=f"http {resp.status_code}: {resp.text[:HTTP_ERROR_MSG_MAX]}",
            )
        data = resp.json()
        return DispatchReceipt(
            ok=True,
            provider="resend",
            provider_id=str(data.get("id")) if data.get("id") else None,
            error=None,
        )
