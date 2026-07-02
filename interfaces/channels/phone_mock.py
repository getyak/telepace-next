"""MockPhone dispatcher — writes to data/dispatched/phone_outbound.jsonl."""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime
from uuid import UUID

from interfaces.channels.base import DispatchReceipt, Invite

logger = logging.getLogger(__name__)

_DISPATCH_DIR = "data/dispatched"


class MockPhone:
    provider_name = "mock"

    async def place_call(
        self,
        invite: Invite,
        opening_line: str,
        spec_id: UUID,
    ) -> DispatchReceipt:
        os.makedirs(_DISPATCH_DIR, exist_ok=True)
        record = {
            "ts": datetime.utcnow().isoformat() + "Z",
            "channel": "phone_outbound",
            "to": invite.address,
            "name": invite.name,
            "opening_line": opening_line,
            "spec_id": str(spec_id),
            "share_url": invite.share_url,
        }
        with open(
            os.path.join(_DISPATCH_DIR, "phone_outbound.jsonl"),
            "a",
            encoding="utf-8",
        ) as f:
            f.write(json.dumps(record) + "\n")
        provider_id = uuid.uuid4().hex
        logger.info("MockPhone placed id=%s to=<redacted>", provider_id)
        return DispatchReceipt(ok=True, provider="mock", provider_id=provider_id, error=None)
