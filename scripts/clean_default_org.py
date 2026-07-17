"""One-off cleanup of the shared default-org test cruft.

Before the per-user-org fix (T-501), every registration fell back to the
shared dev default org, so ~65 test campaigns (duplicates, mixed zh/en,
throwaway "what can you do?" drafts) piled up under
``00000000-0000-0000-0000-000000000001``. New users no longer land there,
but the historical rows still exist and would pollute any query that ever
touches the default org.

This script deletes every campaign owned by the default org together with
its event-sourced ``events`` and derived ``insights`` (neither table has an
FK cascade, so they are removed explicitly, campaign last). It is:

- **dry-run by default** — prints what *would* be deleted; pass ``--apply``
  to actually delete.
- **transactional** — all three deletes commit together or not at all.
- **idempotent** — re-running after a successful apply deletes 0 rows.
- **scoped** — only the default org is touched; real user orgs are never
  read or modified.

Usage::

    python -m scripts.clean_default_org            # dry-run (report only)
    python -m scripts.clean_default_org --apply     # perform the deletion
    python -m scripts.clean_default_org --org <uuid>  # override the org id

Exit code 0 on success, 1 on error.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

import asyncpg

from interfaces.rest_api.config import get_settings


async def _counts(conn: asyncpg.Connection, org_id: str) -> dict[str, int]:
    row = await conn.fetchrow(
        """
        SELECT
          (SELECT count(*) FROM campaigns WHERE org_id = $1) AS campaigns,
          (SELECT count(*) FROM events
             WHERE campaign_id IN (SELECT id FROM campaigns WHERE org_id = $1)) AS events,
          (SELECT count(*) FROM insights
             WHERE campaign_id IN (SELECT id FROM campaigns WHERE org_id = $1)) AS insights
        """,
        org_id,
    )
    return {"campaigns": row["campaigns"], "events": row["events"], "insights": row["insights"]}


async def _sample(conn: asyncpg.Connection, org_id: str, limit: int = 10) -> list[str]:
    rows = await conn.fetch(
        "SELECT left(title, 48) AS title, status FROM campaigns "
        "WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2",
        org_id,
        limit,
    )
    return [f"[{r['status']}] {r['title']}" for r in rows]


async def _run(org_id: str, apply: bool) -> int:
    settings = get_settings()
    conn = await asyncpg.connect(settings.database_url)
    try:
        before = await _counts(conn, org_id)
        print(f"default org : {org_id}")
        print(
            f"to delete   : {before['campaigns']} campaigns, "
            f"{before['events']} events, {before['insights']} insights"
        )
        if before["campaigns"] == 0:
            print("nothing to clean — default org is already empty.")
            return 0

        print("sample      :")
        for line in await _sample(conn, org_id):
            print(f"  - {line}")

        if not apply:
            print("---")
            print("dry-run only — re-run with --apply to delete the rows above.")
            return 0

        # All-or-nothing: derived rows first, campaigns last.
        async with conn.transaction():
            await conn.execute(
                "DELETE FROM insights WHERE campaign_id IN "
                "(SELECT id FROM campaigns WHERE org_id = $1)",
                org_id,
            )
            await conn.execute(
                "DELETE FROM events WHERE campaign_id IN "
                "(SELECT id FROM campaigns WHERE org_id = $1)",
                org_id,
            )
            await conn.execute("DELETE FROM campaigns WHERE org_id = $1", org_id)

        after = await _counts(conn, org_id)
        print("---")
        print(
            f"deleted     : {before['campaigns']} campaigns, "
            f"{before['events']} events, {before['insights']} insights"
        )
        print(
            f"remaining   : {after['campaigns']} campaigns, "
            f"{after['events']} events, {after['insights']} insights"
        )
        return 0 if after["campaigns"] == 0 else 1
    finally:
        await conn.close()


def main() -> None:
    p = argparse.ArgumentParser(description="Clean shared default-org test cruft.")
    p.add_argument(
        "--apply",
        action="store_true",
        help="Actually delete (default is a dry-run report).",
    )
    p.add_argument(
        "--org",
        default=None,
        help="Override the org id (defaults to settings.default_org_id).",
    )
    args = p.parse_args()
    org_id = args.org or get_settings().default_org_id
    sys.exit(asyncio.run(_run(org_id, args.apply)))


if __name__ == "__main__":
    main()
