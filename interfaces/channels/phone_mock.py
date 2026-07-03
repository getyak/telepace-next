"""MockPhone dispatcher — writes to data/dispatched/phone_outbound.jsonl."""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import UTC, datetime
from uuid import UUID

from core.constants import DISPATCH_LOG_FILENAMES
from interfaces.channels.base import DispatchReceipt, Invite

logger = logging.getLogger(__name__)


class MockPhone:
    provider_name = "mock"

    def __init__(self, *, log_dir: str) -> None:
        self._log_dir = log_dir

    async def place_call(
        self,
        invite: Invite,
        opening_line: str,
        spec_id: UUID,
    ) -> DispatchReceipt:
        os.makedirs(self._log_dir, exist_ok=True)
        record = {
            "ts": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "channel": "phone_outbound",
            "to": invite.address,
            "name": invite.name,
            "opening_line": opening_line,
            "spec_id": str(spec_id),
            "share_url": invite.share_url,
        }
        with open(
            os.path.join(self._log_dir, DISPATCH_LOG_FILENAMES["phone"]),
            "a",
            encoding="utf-8",
        ) as f:
            f.write(json.dumps(record) + "\n")
        provider_id = uuid.uuid4().hex
        logger.info("MockPhone placed id=%s to=<redacted>", provider_id)
        return DispatchReceipt(ok=True, provider="mock", provider_id=provider_id, error=None)
