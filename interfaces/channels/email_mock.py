"""MockEmail dispatcher — writes to data/dispatched/email.jsonl."""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime

from interfaces.channels.base import DispatchReceipt, Invite

logger = logging.getLogger(__name__)

_DISPATCH_DIR = "data/dispatched"


class MockEmail:
    provider_name = "mock"

    async def send(
        self,
        invite: Invite,
        subject: str,
        body_html: str,
        body_text: str,
    ) -> DispatchReceipt:
        _ = body_html
        os.makedirs(_DISPATCH_DIR, exist_ok=True)
        record = {
            "ts": datetime.utcnow().isoformat() + "Z",
            "channel": "email",
            "to": invite.address,
            "name": invite.name,
            "subject": subject,
            "body_text": body_text,
            "share_url": invite.share_url,
        }
        with open(os.path.join(_DISPATCH_DIR, "email.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
        provider_id = uuid.uuid4().hex
        logger.info("MockEmail sent id=%s to=<redacted>", provider_id)
        return DispatchReceipt(ok=True, provider="mock", provider_id=provider_id, error=None)
