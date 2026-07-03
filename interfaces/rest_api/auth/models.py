"""Pydantic request/response schemas + AuthUser dataclass.

All lengths/policies (min password length) come from Settings — validators
here accept whatever the settings-level constraint requires, and the router
enforces the policy at request time. No policy constants live in this file.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# RFC 5322 is too permissive to hand-roll — accept the practical subset used
# by everyone. Pydantic's EmailStr requires an extra dependency we don't want
# to pull in yet; the router lowercases and stores emails opaquely.
_EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=254, pattern=_EMAIL_PATTERN)
    password: str = Field(min_length=1, max_length=256)
    display_name: str | None = Field(default=None, max_length=256)
    org_id: UUID | None = None


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=254, pattern=_EMAIL_PATTERN)
    password: str = Field(min_length=1, max_length=256)


class RefreshRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    refresh_token: str


class TokenResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # access token seconds until expiry


class UserResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    email: str
    display_name: str | None
    org_id: UUID
    created_at: datetime


@dataclass(slots=True, frozen=True)
class AuthUser:
    """The verified caller for a given request."""

    id: UUID
    email: str
    org_id: UUID
    scopes: tuple[str, ...] = ()

    @property
    def actor_ref(self) -> str:
        """Actor string for event log (composed with Settings.actor_prefix_user)."""
        return f"{self.id}"
