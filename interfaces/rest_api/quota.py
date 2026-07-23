"""Quota enforcement dependency (T-622).

Attached to endpoints that launch new interview volume (starting a study,
dispatching invites). Free-plan orgs at their monthly qualified-interview
quota get 402 with a machine-readable body the frontend turns into an
upgrade prompt. Paid plans always pass — beyond-quota usage is metered
overage, not a hard stop.

When billing is not configured (dev without Stripe, tests that don't care),
the dependency is a no-op so the rest of the product keeps working.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status

from interfaces.rest_api.auth.deps import require_current_user
from interfaces.rest_api.auth.models import AuthUser
from interfaces.rest_api.deps import get_state
from interfaces.rest_api.errors import ErrorMessages


async def enforce_interview_quota(
    request: Request,
    user: AuthUser = Depends(require_current_user),
) -> None:
    billing = getattr(get_state(request), "billing", None)
    if billing is None:
        return
    decision = await billing.check_quota(user.org_id)
    if not decision.allowed:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "message": ErrorMessages.QUOTA_EXCEEDED,
                "code": "quota_exceeded",
                "plan": decision.plan.value,
                "quota": decision.quota,
                "used": decision.used,
            },
        )
