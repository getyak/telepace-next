"""Channel dispatcher protocols and shared types.

The dispatcher layer is the only layer that touches raw recipient addresses.
Callers (harness handlers, projections, event log) receive only a hashed
representation via `DispatchReceipt`/`InviteDispatched`.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Protocol, TypeVar
from uuid import UUID

logger = logging.getLogger(__name__)

T = TypeVar("T")


@dataclass(slots=True)
class Invite:
    """One dispatch target — address is raw PII, do NOT log."""

    recipient_id: UUID
    address: str
    name: str | None
    personalized_intro: str | None
    share_url: str


@dataclass(slots=True)
class DispatchReceipt:
    ok: bool
    provider: str
    provider_id: str | None
    error: str | None


class EmailDispatcher(Protocol):
    async def send(
        self,
        invite: Invite,
        subject: str,
        body_html: str,
        body_text: str,
    ) -> DispatchReceipt: ...


class SmsDispatcher(Protocol):
    async def send(self, invite: Invite, body: str) -> DispatchReceipt: ...


class PhoneDispatcher(Protocol):
    async def place_call(
        self,
        invite: Invite,
        opening_line: str,
        spec_id: UUID,
    ) -> DispatchReceipt: ...


async def retry(
    coro_factory: Callable[[], Awaitable[T]],
    *,
    attempts: int = 3,
    base_delay: float = 0.25,
    retry_on: tuple[type[BaseException], ...] = (Exception,),
) -> T:
    """Exponential-backoff retry helper.

    Retries transient errors (network/timeout/5xx surfaced as exceptions).
    Provider adapters raise a plain Exception for retryable conditions.
    """

    last_exc: BaseException | None = None
    for attempt in range(attempts):
        try:
            return await coro_factory()
        except retry_on as exc:
            last_exc = exc
            if attempt == attempts - 1:
                break
            delay = base_delay * (2**attempt)
            logger.warning(
                "dispatcher retry", extra={"attempt": attempt + 1, "delay": delay}
            )
            await asyncio.sleep(delay)
    assert last_exc is not None
    raise last_exc
