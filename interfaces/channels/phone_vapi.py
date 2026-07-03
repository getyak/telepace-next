"""Vapi outbound-call dispatcher — thin HTTP wrapper, no SDK."""

from __future__ import annotations

import logging
from uuid import UUID

import httpx

from interfaces.channels.base import DispatchReceipt, Invite, retry

logger = logging.getLogger(__name__)

_DEFAULT_BASE_URL = "https://api.vapi.ai"


class VapiPhone:
    provider_name = "vapi"

    def __init__(
        self,
        *,
        api_key: str,
        assistant_id: str,
        phone_number_id: str,
        base_url: str = _DEFAULT_BASE_URL,
        timeout: float = 15.0,
    ) -> None:
        self._api_key = api_key
        self._assistant_id = assistant_id
        self._phone_number_id = phone_number_id
        self._endpoint = f"{base_url.rstrip('/')}/call"
        self._timeout = timeout

    async def place_call(
        self,
        invite: Invite,
        opening_line: str,
        spec_id: UUID,
    ) -> DispatchReceipt:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "assistantId": self._assistant_id,
            "phoneNumberId": self._phone_number_id,
            "customer": {"number": invite.address, "name": invite.name},
            "assistantOverrides": {
                "firstMessage": opening_line,
                "metadata": {
                    "spec_id": str(spec_id),
                    "recipient_id": str(invite.recipient_id),
                },
            },
        }

        async def _do() -> httpx.Response:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                r = await client.post(self._endpoint, headers=headers, json=payload)
                if r.status_code >= 500:
                    raise Exception(f"vapi 5xx: {r.status_code}")
                return r

        try:
            resp = await retry(_do)
        except Exception as exc:
            return DispatchReceipt(
                ok=False, provider="vapi", provider_id=None, error=str(exc)
            )

        if resp.status_code >= 400:
            return DispatchReceipt(
                ok=False,
                provider="vapi",
                provider_id=None,
                error=f"http {resp.status_code}: {resp.text[:200]}",
            )
        data = resp.json()
        return DispatchReceipt(
            ok=True,
            provider="vapi",
            provider_id=str(data.get("id")) if data.get("id") else None,
            error=None,
        )
