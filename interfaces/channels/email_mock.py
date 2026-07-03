"""MockEmail dispatcher — writes to data/dispatched/email.jsonl."""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import UTC, datetime

from interfaces.channels.base import DispatchReceipt, Invite

logger = logging.getLogger(__name__)

_DEFAULT_DISPATCH_DIR = "data/dispatched"


class MockEmail:
    provider_name = "mock"

    def __init__(self, *, log_dir: str = _DEFAULT_DISPATCH_DIR) -> None:
        self._log_dir = log_dir

    async def send(
        self,
        invite: Invite,
        subject: str,
        body_html: str,
        body_text: str,
    ) -> DispatchReceipt:
        _ = body_html
        os.makedirs(self._log_dir, exist_ok=True)
        record = {
            "ts": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "channel": "email",
            "to": invite.address,
            "name": invite.name,
            "subject": subject,
            "body_text": body_text,
            "share_url": invite.share_url,
        }
        with open(os.path.join(self._log_dir, "email.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
        provider_id = uuid.uuid4().hex
        logger.info("MockEmail sent id=%s to=<redacted>", provider_id)
        return DispatchReceipt(ok=True, provider="mock", provider_id=provider_id, error=None)
