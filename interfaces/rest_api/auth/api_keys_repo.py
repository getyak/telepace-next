"""Postgres repository for revocable machine credentials.

Long-lived machine credentials for Agents calling the MCP server. Decoupled
from JWT: JWT is a short-lived human session token; an API key is a revocable,
scoped, auditable credential for a machine.

Schema is created on startup via `API_KEYS_SCHEMA_SQL`, same pattern as
`auth.users_repo.USERS_SCHEMA_SQL`. Only a SHA-256 hash of the key is stored;
the plaintext key is shown to the caller exactly once, at creation time.

See docs/mcp-key-auth-design.md §4, §7.
"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID, uuid4

import asyncpg  # type: ignore[import-untyped]

# Number of leading characters of the full key kept for UI display. Long enough
# to include the environment prefix (e.g. "tp_live_") plus a few random chars so
# a human can tell two keys apart, short enough to leak no usable entropy.
KEY_PREFIX_DISPLAY_LEN: int = 12

API_KEYS_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS api_keys (
    id           UUID PRIMARY KEY,
    org_id       UUID NOT NULL,
    user_id      UUID NOT NULL,
    name         TEXT NOT NULL,
    key_prefix   TEXT NOT NULL,
    key_hash     TEXT NOT NULL UNIQUE,
    scopes       TEXT NOT NULL DEFAULT '',
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS api_keys_org_idx  ON api_keys (org_id);
CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys (user_id);
"""


class ApiKeyNotFoundError(Exception):
    """Raised when a lookup by id misses (e.g. revoke on a non-existent key)."""


@dataclass(slots=True, frozen=True)
class ApiKeyRecord:
    """A stored key. Never carries the plaintext key — only its hash/prefix."""

    id: UUID
    org_id: UUID
    user_id: UUID
    name: str
    key_prefix: str
    key_hash: str
    scopes: str  # space-separated
    is_active: bool
    last_used_at: datetime | None
    expires_at: datetime | None
    created_at: datetime
    revoked_at: datetime | None


@dataclass(slots=True, frozen=True)
class NewApiKey:
    """Returned once from `create()`: the record plus the ONE-TIME plaintext.

    `plaintext` must be surfaced to the caller and then discarded — it is never
    recoverable from the DB.
    """

    record: ApiKeyRecord
    plaintext: str = field(repr=False)


def _now() -> datetime:
    return datetime.now(tz=UTC)


def generate_key(*, prefix: str, entropy_bytes: int) -> str:
    """Return a fresh URL-safe key string `<prefix><random>`.

    Uses `secrets.token_urlsafe`. Prefix is e.g. `tp_live_` / `tp_test_`.
    The caller owns the prefix so this module never hardcodes an environment.
    """
    if entropy_bytes < 32:
        raise ValueError("entropy_bytes must be >= 32")
    return f"{prefix}{secrets.token_urlsafe(entropy_bytes)}"


def hash_key(plaintext: str) -> str:
    """Return the SHA-256 hex digest stored in `api_keys.key_hash`.

    The key is high-entropy random, so no salt is needed (rainbow tables are
    moot). Must be deterministic so `verify()` can look it up by index.
    """
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


class ApiKeysRepo:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def create(
        self,
        *,
        org_id: UUID,
        user_id: UUID,
        name: str,
        scopes: list[str],
        prefix: str,
        entropy_bytes: int,
        expires_at: datetime | None = None,
    ) -> NewApiKey:
        """Generate a key, store its hash, return the one-time plaintext.

        Steps: generate_key → hash_key → INSERT (id, org, user, name,
        key_prefix, key_hash, scopes joined by space, expires_at, created_at).
        """
        plaintext = generate_key(prefix=prefix, entropy_bytes=entropy_bytes)
        key_hash = hash_key(plaintext)
        key_prefix = plaintext[:KEY_PREFIX_DISPLAY_LEN]
        scopes_str = " ".join(scopes)
        kid = uuid4()
        now = _now()
        await self._pool.execute(
            """
            INSERT INTO api_keys
                (id, org_id, user_id, name, key_prefix, key_hash, scopes,
                 is_active, last_used_at, expires_at, created_at, revoked_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NULL, $8, $9, NULL)
            """,
            kid,
            org_id,
            user_id,
            name,
            key_prefix,
            key_hash,
            scopes_str,
            expires_at,
            now,
        )
        record = ApiKeyRecord(
            id=kid,
            org_id=org_id,
            user_id=user_id,
            name=name,
            key_prefix=key_prefix,
            key_hash=key_hash,
            scopes=scopes_str,
            is_active=True,
            last_used_at=None,
            expires_at=expires_at,
            created_at=now,
            revoked_at=None,
        )
        return NewApiKey(record=record, plaintext=plaintext)

    async def verify(self, key_hash: str) -> ApiKeyRecord | None:
        """Look up an active, unexpired key by its hash. None if no match.

        Caller passes `hash_key(plaintext)`. Returns None when: not found,
        `is_active=false`, or `expires_at < now()`. The hash lookup rides the
        unique index, so the comparison happens in the DB — no application-layer
        timing side channel.
        """
        row = await self._pool.fetchrow(
            """
            SELECT * FROM api_keys
            WHERE key_hash = $1
              AND is_active = TRUE
              AND revoked_at IS NULL
              AND (expires_at IS NULL OR expires_at > NOW())
            """,
            key_hash,
        )
        return _row_to_record(row) if row else None

    async def list_for_org(self, org_id: UUID) -> list[ApiKeyRecord]:
        """List an org's keys (active + revoked) for the management UI.

        Never returns plaintext — callers show `key_prefix` only.
        """
        rows = await self._pool.fetch(
            "SELECT * FROM api_keys WHERE org_id = $1 ORDER BY created_at DESC",
            org_id,
        )
        return [_row_to_record(row) for row in rows]

    async def revoke(self, *, key_id: UUID, org_id: UUID) -> None:
        """Soft-delete: set is_active=false, revoked_at=now().

        `org_id` scopes the revoke so a user cannot revoke another org's key.
        Raises ApiKeyNotFoundError if the (id, org_id) pair does not match.
        """
        row = await self._pool.fetchrow(
            """
            UPDATE api_keys
            SET is_active = FALSE, revoked_at = NOW()
            WHERE id = $1 AND org_id = $2
            RETURNING id
            """,
            key_id,
            org_id,
        )
        if row is None:
            raise ApiKeyNotFoundError(str(key_id))

    async def touch_last_used(self, key_id: UUID) -> None:
        """Best-effort update of `last_used_at` on a successful auth.

        Fire-and-forget; failure to update must not fail the request.
        """
        await self._pool.execute(
            "UPDATE api_keys SET last_used_at = NOW() WHERE id = $1",
            key_id,
        )


def _row_to_record(row: asyncpg.Record) -> ApiKeyRecord:
    return ApiKeyRecord(
        id=row["id"],
        org_id=row["org_id"],
        user_id=row["user_id"],
        name=row["name"],
        key_prefix=row["key_prefix"],
        key_hash=row["key_hash"],
        scopes=row["scopes"],
        is_active=row["is_active"],
        last_used_at=row["last_used_at"],
        expires_at=row["expires_at"],
        created_at=row["created_at"],
        revoked_at=row["revoked_at"],
    )
