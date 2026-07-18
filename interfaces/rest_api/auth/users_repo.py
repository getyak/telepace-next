"""Postgres users repository.

Schema is created on startup via `USERS_SCHEMA_SQL` (same pattern as
`storage.projections`). No hardcoded org/user id lives here; callers pass
`fallback_org_id` explicitly (from Settings) when a registration has no org.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID, uuid4

import asyncpg

USERS_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id             UUID PRIMARY KEY,
    email          TEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    display_name   TEXT,
    org_id         UUID NOT NULL,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL,
    updated_at     TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS users_org_idx ON users (org_id);
CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));

-- SSO support (T-512): a Google-signed-in user has no password. Make the hash
-- nullable and record which provider + subject id owns the account so the same
-- email can later bind multiple providers. Idempotent so startup re-runs are safe.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'password';
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_provider_sub_idx
    ON users (auth_provider, provider_sub)
    WHERE provider_sub IS NOT NULL;
"""


class UserAlreadyExistsError(Exception):
    """Raised when register hits a unique-violation on email."""


class UserNotFoundError(Exception):
    """Raised when a lookup by id / email misses."""


@dataclass(slots=True, frozen=True)
class UserRecord:
    id: UUID
    email: str
    password_hash: str | None
    display_name: str | None
    org_id: UUID
    is_active: bool
    failed_attempts: int
    locked_until: datetime | None
    created_at: datetime
    updated_at: datetime
    auth_provider: str = "password"
    provider_sub: str | None = None


def _now() -> datetime:
    return datetime.now(tz=UTC)


class UsersRepo:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def create(
        self,
        *,
        email: str,
        password_hash: str,
        display_name: str | None,
        org_id: UUID,
    ) -> UserRecord:
        uid = uuid4()
        now = _now()
        try:
            await self._pool.execute(
                """
                INSERT INTO users
                    (id, email, password_hash, display_name, org_id,
                     is_active, failed_attempts, locked_until, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, TRUE, 0, NULL, $6, $6)
                """,
                uid,
                email.lower(),
                password_hash,
                display_name,
                org_id,
                now,
            )
        except asyncpg.UniqueViolationError as exc:
            raise UserAlreadyExistsError(email) from exc
        return UserRecord(
            id=uid,
            email=email.lower(),
            password_hash=password_hash,
            display_name=display_name,
            org_id=org_id,
            is_active=True,
            failed_attempts=0,
            locked_until=None,
            created_at=now,
            updated_at=now,
        )

    async def create_oauth(
        self,
        *,
        email: str,
        display_name: str | None,
        org_id: UUID,
        provider: str,
        provider_sub: str,
    ) -> UserRecord:
        """Create a passwordless user that signed in via an OAuth provider.

        `password_hash` is NULL — such an account can only ever authenticate
        through its provider, never via the password login path.
        """
        uid = uuid4()
        now = _now()
        try:
            await self._pool.execute(
                """
                INSERT INTO users
                    (id, email, password_hash, display_name, org_id,
                     is_active, failed_attempts, locked_until, created_at, updated_at,
                     auth_provider, provider_sub)
                VALUES ($1, $2, NULL, $3, $4, TRUE, 0, NULL, $5, $5, $6, $7)
                """,
                uid,
                email.lower(),
                display_name,
                org_id,
                now,
                provider,
                provider_sub,
            )
        except asyncpg.UniqueViolationError as exc:
            raise UserAlreadyExistsError(email) from exc
        return UserRecord(
            id=uid,
            email=email.lower(),
            password_hash=None,
            display_name=display_name,
            org_id=org_id,
            is_active=True,
            failed_attempts=0,
            locked_until=None,
            created_at=now,
            updated_at=now,
            auth_provider=provider,
            provider_sub=provider_sub,
        )

    async def get_by_provider(self, provider: str, provider_sub: str) -> UserRecord | None:
        row = await self._pool.fetchrow(
            "SELECT * FROM users WHERE auth_provider = $1 AND provider_sub = $2",
            provider,
            provider_sub,
        )
        return _row_to_record(row) if row else None

    async def get_by_email(self, email: str) -> UserRecord | None:
        row = await self._pool.fetchrow(
            "SELECT * FROM users WHERE email = $1",
            email.lower(),
        )
        return _row_to_record(row) if row else None

    async def get_by_id(self, user_id: UUID) -> UserRecord:
        row = await self._pool.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
        if row is None:
            raise UserNotFoundError(str(user_id))
        return _row_to_record(row)

    async def record_failed_attempt(
        self,
        *,
        user_id: UUID,
        max_attempts: int,
        lockout_seconds: int,
    ) -> UserRecord:
        row = await self._pool.fetchrow(
            """
            UPDATE users
            SET failed_attempts = failed_attempts + 1,
                locked_until = CASE
                    WHEN failed_attempts + 1 >= $2
                    THEN NOW() + ($3 || ' seconds')::interval
                    ELSE locked_until
                END,
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
            """,
            user_id,
            max_attempts,
            lockout_seconds,
        )
        if row is None:
            raise UserNotFoundError(str(user_id))
        return _row_to_record(row)

    async def reset_failed_attempts(self, user_id: UUID) -> None:
        await self._pool.execute(
            """
            UPDATE users
            SET failed_attempts = 0, locked_until = NULL, updated_at = NOW()
            WHERE id = $1
            """,
            user_id,
        )


def _row_to_record(row: asyncpg.Record) -> UserRecord:
    return UserRecord(
        id=row["id"],
        email=row["email"],
        password_hash=row["password_hash"],
        display_name=row["display_name"],
        org_id=row["org_id"],
        is_active=row["is_active"],
        failed_attempts=row["failed_attempts"],
        locked_until=row["locked_until"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        auth_provider=row["auth_provider"],
        provider_sub=row["provider_sub"],
    )
