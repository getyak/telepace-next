"""Real-Postgres integration coverage for `ApiKeysRepo` (design §10).

Runs `API_KEYS_SCHEMA_SQL` against a live database, then exercises the full
lifecycle end to end:

  create -> verify -> revoke -> verify(None)

plus the wrong-org revoke guard (-> ApiKeyNotFoundError) and `touch_last_used`.

Unlike the pure-logic unit tests (tests/mcp/test_key_auth.py), this hits the
real SQL — the INSERT/SELECT/UPDATE statements and the unique hash index — so a
regression in the actual queries is caught. The DB is skipped (not failed) when
no Postgres is reachable, so the suite still runs in a DB-less environment.

Point it at a database with TELEPACE_DATABASE_URL; it defaults to the local
dev Postgres in Settings.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit
from uuid import uuid4

import asyncpg
import pytest

from interfaces.rest_api.auth.api_keys_repo import (
    API_KEYS_SCHEMA_SQL,
    ApiKeyNotFoundError,
    ApiKeysRepo,
    hash_key,
)
from interfaces.rest_api.config import get_settings

# tp_test_ prefix: this only ever runs against a test/dev database.
_TEST_PREFIX = "tp_test_"
_ENTROPY_BYTES = 32


@pytest.fixture()
async def pool() -> asyncpg.Pool:
    """A pool against the configured Postgres, or skip if it is unreachable.

    Applies the schema on entry so the table exists exactly as startup would
    create it, and drops only the rows this test created on exit (it never
    drops the shared table).
    """
    test_url = os.environ.get("TELEPACE_TEST_DATABASE_URL", "")
    if (
        not test_url
        or urlsplit(test_url).hostname not in {"127.0.0.1", "localhost"}
        or not urlsplit(test_url).path.startswith("/telepace_test")
    ):
        pytest.skip(
            "Set TELEPACE_TEST_DATABASE_URL to a disposable loopback telepace_test database"
        )
    settings = get_settings().model_copy(update={"database_url": test_url})
    try:
        created = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=2)
    except (OSError, asyncpg.PostgresError) as exc:
        pytest.skip(f"Postgres not reachable at {settings.database_url}: {exc}")

    async with created.acquire() as conn:
        await conn.execute(API_KEYS_SCHEMA_SQL)
    try:
        yield created
    finally:
        await created.close()


async def test_create_verify_revoke_lifecycle(pool: asyncpg.Pool) -> None:
    repo = ApiKeysRepo(pool)
    org_id = uuid4()
    user_id = uuid4()

    # create: returns the one-time plaintext and a stored record.
    new_key = await repo.create(
        org_id=org_id,
        user_id=user_id,
        name="integration-test",
        scopes=["campaigns:read", "insights:read"],
        prefix=_TEST_PREFIX,
        entropy_bytes=_ENTROPY_BYTES,
    )
    assert new_key.plaintext.startswith(_TEST_PREFIX)
    assert new_key.record.org_id == org_id
    assert new_key.record.scopes == "campaigns:read insights:read"

    try:
        # verify: the plaintext's hash resolves to the active record.
        found = await repo.verify(hash_key(new_key.plaintext))
        assert found is not None
        assert found.id == new_key.record.id
        assert found.org_id == org_id
        assert found.is_active is True

        # touch_last_used: sets last_used_at from NULL to a timestamp.
        assert found.last_used_at is None
        await repo.touch_last_used(new_key.record.id)
        touched = await repo.verify(hash_key(new_key.plaintext))
        assert touched is not None
        assert touched.last_used_at is not None

        # wrong-org revoke: another org cannot revoke this key.
        with pytest.raises(ApiKeyNotFoundError):
            await repo.revoke(key_id=new_key.record.id, org_id=uuid4())
        # ...and the key is still verifiable after the failed revoke.
        assert await repo.verify(hash_key(new_key.plaintext)) is not None

        # revoke: owner soft-deletes the key.
        await repo.revoke(key_id=new_key.record.id, org_id=org_id)

        # verify(None): a revoked key no longer authenticates.
        assert await repo.verify(hash_key(new_key.plaintext)) is None
    finally:
        # Clean up only this test's row; leave the shared table intact.
        await pool.execute("DELETE FROM api_keys WHERE id = $1", new_key.record.id)


async def test_expired_key_not_verified(pool: asyncpg.Pool) -> None:
    repo = ApiKeysRepo(pool)
    org_id = uuid4()

    new_key = await repo.create(
        org_id=org_id,
        user_id=uuid4(),
        name="expired",
        scopes=["campaigns:read"],
        prefix=_TEST_PREFIX,
        entropy_bytes=_ENTROPY_BYTES,
        expires_at=datetime.now(tz=UTC) - timedelta(days=1),
    )
    try:
        # An already-expired key is filtered out by the SQL predicate.
        assert await repo.verify(hash_key(new_key.plaintext)) is None
    finally:
        await pool.execute("DELETE FROM api_keys WHERE id = $1", new_key.record.id)


async def test_revoked_timestamp_fails_closed_even_if_active_flag_is_inconsistent(
    pool: asyncpg.Pool,
) -> None:
    repo = ApiKeysRepo(pool)
    new = await repo.create(
        org_id=uuid4(),
        user_id=uuid4(),
        name="inconsistent fixture",
        scopes=["campaigns:read"],
        prefix=_TEST_PREFIX,
        entropy_bytes=_ENTROPY_BYTES,
    )
    try:
        await pool.execute("UPDATE api_keys SET revoked_at = NOW() WHERE id = $1", new.record.id)
        assert await repo.verify(hash_key(new.plaintext)) is None
    finally:
        await pool.execute("DELETE FROM api_keys WHERE id = $1", new.record.id)
