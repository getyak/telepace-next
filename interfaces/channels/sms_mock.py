"""MockSMS dispatcher — writes to data/dispatched/sms.jsonl."""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime

from interfaces.channels.base import DispatchReceipt, Invite

logger = logging.getLogger(__name__)

_DISPATCH_DIR = "data/dispatched"


class MockSMS:
    provider_name = "mock"

    async def send(self, invite: Invite, body: str) -> DispatchReceipt:
        os.makedirs(_DISPATCH_DIR, exist_ok=True)
        record = {
            "ts": datetime.utcnow().isoformat() + "Z",
            "channel": "sms",
            "to": invite.address,
            "name": invite.name,
            "body": body,
            "share_url": invite.share_url,
        }
        with open(os.path.join(_DISPATCH_DIR, "sms.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
        provider_id = uuid.uuid4().hex
        logger.info("MockSMS sent id=%s to=<redacted>", provider_id)
        return DispatchReceipt(ok=True, provider="mock", provider_id=provider_id, error=None)
