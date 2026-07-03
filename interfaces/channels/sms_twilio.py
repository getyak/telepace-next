"""Twilio SMS dispatcher — HTTP Basic + form-encoded, no SDK."""

from __future__ import annotations

import logging

import httpx

from interfaces.channels.base import DispatchReceipt, Invite, retry

logger = logging.getLogger(__name__)


class TwilioSMS:
    provider_name = "twilio"

    def __init__(
        self,
        *,
        account_sid: str,
        auth_token: str,
        from_number: str,
        base_url: str = "https://api.twilio.com/2010-04-01",
        timeout: float = 10.0,
    ) -> None:
        self._sid = account_sid
        self._token = auth_token
        self._from = from_number
        self._timeout = timeout
        self._endpoint = f"{base_url.rstrip('/')}/Accounts/{account_sid}/Messages.json"

    async def send(self, invite: Invite, body: str) -> DispatchReceipt:
        auth = httpx.BasicAuth(self._sid, self._token)
        data = {"To": invite.address, "From": self._from, "Body": body}

        async def _do() -> httpx.Response:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                r = await client.post(self._endpoint, auth=auth, data=data)
                if r.status_code >= 500:
                    raise Exception(f"twilio 5xx: {r.status_code}")
                return r

        try:
            resp = await retry(_do)
        except Exception as exc:
            return DispatchReceipt(
                ok=False, provider="twilio", provider_id=None, error=str(exc)
            )

        if resp.status_code >= 400:
            return DispatchReceipt(
                ok=False,
                provider="twilio",
                provider_id=None,
                error=f"http {resp.status_code}: {resp.text[:200]}",
            )
        payload = resp.json()
        return DispatchReceipt(
            ok=True,
            provider="twilio",
            provider_id=str(payload.get("sid")) if payload.get("sid") else None,
            error=None,
        )
