"""Channel dispatch adapters (email, sms, phone_outbound).

Provider-specific implementations live alongside a mock fallback per channel.
"""

from interfaces.channels.base import (
    DispatchReceipt,
    EmailDispatcher,
    Invite,
    PhoneDispatcher,
    SmsDispatcher,
)

__all__ = [
    "DispatchReceipt",
    "EmailDispatcher",
    "Invite",
    "PhoneDispatcher",
    "SmsDispatcher",
]
