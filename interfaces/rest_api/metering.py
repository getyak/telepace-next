"""Usage metering hook: consume InterviewCompleted from the event tail.

Resolves the org (via the campaigns projection) and the interview channel
(via the respondent_joined event) then hands off to BillingService. Runs
inside the tail loop; any failure is logged and swallowed so metering can
never stall projections or analysis.
"""

from __future__ import annotations

import logging

from core.events import InterviewCompleted
from interfaces.rest_api.deps import AppState

logger = logging.getLogger(__name__)


async def meter_completion(state: AppState, event: InterviewCompleted) -> None:
    billing = state.billing
    if billing is None or not state.settings.billing_metering_enabled:
        return
    try:
        campaign = await state.projector.get_campaign(event.campaign_id)
        if campaign is None:
            logger.warning(
                "metering skipped: campaign %s not in projection", event.campaign_id
            )
            return
        channel = await _resolve_channel(state, event)
        await billing.record_completion(
            org_id=campaign.org_id,
            campaign_id=event.campaign_id,
            interview_id=event.interview_id,
            duration_seconds=event.duration_seconds,
            goal_coverage=event.goal_coverage,
            channel=channel,
            occurred_at=event.ts,
        )
    except Exception:
        logger.exception("usage metering failed interview=%s", event.interview_id)


async def _resolve_channel(state: AppState, event: InterviewCompleted) -> str | None:
    """Find the channel the respondent joined on (voice vs text pricing)."""
    row = await state.pool.fetchrow(
        """
        SELECT payload->>'channel' AS channel
          FROM events
         WHERE campaign_id = $1
           AND type = 'interview.respondent_joined'
           AND payload->>'interview_id' = $2
         ORDER BY seq ASC
         LIMIT 1
        """,
        event.campaign_id,
        str(event.interview_id),
    )
    return row["channel"] if row else None
