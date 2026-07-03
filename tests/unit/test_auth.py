"""Unit tests for auth primitives: password hashing + JWT roundtrip.

Repo-level tests belong in tests/integration; these are pure-function tests
that need neither Postgres nor FastAPI wiring.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
import pytest

from interfaces.rest_api.auth.jwt import (
    TokenError,
    decode_access_token,
    decode_refresh_token,
    issue_token_pair,
)
from interfaces.rest_api.auth.password import hash_password, verify_password

_SECRET = "unit-test-secret-value-32-bytes-min"
_ALG = "HS256"
_ISS = "telepace"
_AUD = "telepace-api"


def test_password_hash_and_verify_roundtrip() -> None:
    encoded = hash_password("correct horse battery staple", rounds=2)
    assert encoded.startswith("pbkdf2_sha256$")
    assert verify_password("correct horse battery staple", encoded)
    assert not verify_password("wrong password", encoded)


def test_password_hash_is_salted() -> None:
    a = hash_password("same-password", rounds=2)
    b = hash_password("same-password", rounds=2)
    assert a != b, "identical passwords must produce different hashes (salt)"
    assert verify_password("same-password", a)
    assert verify_password("same-password", b)


def test_password_verify_rejects_malformed_encoded() -> None:
    assert not verify_password("anything", "")
    assert not verify_password("anything", "not-a-valid-format")
    assert not verify_password("anything", "pbkdf2_sha256$abc$def$ghi")
    assert not verify_password("anything", "wrong_algo$120000$c2FsdA==$aGFzaA==")


def test_password_empty_password_rejected_on_hash() -> None:
    with pytest.raises(ValueError):
        hash_password("", rounds=2)


def test_password_invalid_rounds() -> None:
    with pytest.raises(ValueError):
        hash_password("x", rounds=0)


def test_jwt_roundtrip_valid_token() -> None:
    uid = uuid4()
    org = uuid4()
    pair = issue_token_pair(
        user_id=uid,
        org_id=org,
        email="a@b.co",
        scopes=["read"],
        secret=_SECRET,
        algorithm=_ALG,
        access_ttl_seconds=60,
        refresh_ttl_seconds=600,
        issuer=_ISS,
        audience=_AUD,
    )
    claims = decode_access_token(
        pair.access_token,
        secret=_SECRET,
        algorithm=_ALG,
        issuer=_ISS,
        audience=_AUD,
    )
    assert claims.user_id == uid
    assert claims.org_id == org
    assert claims.email == "a@b.co"
    assert claims.scope == "read"


def test_jwt_wrong_secret_raises() -> None:
    pair = issue_token_pair(
        user_id=uuid4(),
        org_id=uuid4(),
        email="a@b.co",
        scopes=None,
        secret=_SECRET,
        algorithm=_ALG,
        access_ttl_seconds=60,
        refresh_ttl_seconds=600,
        issuer=_ISS,
        audience=_AUD,
    )
    with pytest.raises(TokenError):
        decode_access_token(
            pair.access_token,
            secret="different-secret-value",
            algorithm=_ALG,
            issuer=_ISS,
            audience=_AUD,
        )


def test_jwt_wrong_audience_raises() -> None:
    pair = issue_token_pair(
        user_id=uuid4(),
        org_id=uuid4(),
        email="a@b.co",
        scopes=None,
        secret=_SECRET,
        algorithm=_ALG,
        access_ttl_seconds=60,
        refresh_ttl_seconds=600,
        issuer=_ISS,
        audience=_AUD,
    )
    with pytest.raises(TokenError):
        decode_access_token(
            pair.access_token,
            secret=_SECRET,
            algorithm=_ALG,
            issuer=_ISS,
            audience="other-audience",
        )


def test_jwt_expired_token_raises() -> None:
    # Manually craft an already-expired access token so we don't sleep.
    now = datetime.now(tz=UTC)
    expired = jwt.encode(
        {
            "sub": str(uuid4()),
            "org": str(uuid4()),
            "email": "a@b.co",
            "scope": "",
            "iat": int((now - timedelta(minutes=10)).timestamp()),
            "exp": int((now - timedelta(minutes=5)).timestamp()),
            "iss": _ISS,
            "aud": _AUD,
            "typ": "access",
        },
        _SECRET,
        algorithm=_ALG,
    )
    with pytest.raises(TokenError):
        decode_access_token(
            expired, secret=_SECRET, algorithm=_ALG, issuer=_ISS, audience=_AUD
        )


def test_jwt_wrong_type_rejected() -> None:
    """Access-token decoder must reject a refresh token even if signed correctly."""
    pair = issue_token_pair(
        user_id=uuid4(),
        org_id=uuid4(),
        email="a@b.co",
        scopes=None,
        secret=_SECRET,
        algorithm=_ALG,
        access_ttl_seconds=60,
        refresh_ttl_seconds=600,
        issuer=_ISS,
        audience=_AUD,
    )
    with pytest.raises(TokenError):
        decode_access_token(
            pair.refresh_token,
            secret=_SECRET,
            algorithm=_ALG,
            issuer=_ISS,
            audience=_AUD,
        )


def test_refresh_decoder_returns_user_id() -> None:
    uid = uuid4()
    pair = issue_token_pair(
        user_id=uid,
        org_id=uuid4(),
        email="a@b.co",
        scopes=None,
        secret=_SECRET,
        algorithm=_ALG,
        access_ttl_seconds=60,
        refresh_ttl_seconds=600,
        issuer=_ISS,
        audience=_AUD,
    )
    assert (
        decode_refresh_token(
            pair.refresh_token,
            secret=_SECRET,
            algorithm=_ALG,
            issuer=_ISS,
            audience=_AUD,
        )
        == uid
    )


def test_refresh_decoder_rejects_access_token() -> None:
    """Access-typed token must not pass refresh validation."""
    pair = issue_token_pair(
        user_id=uuid4(),
        org_id=uuid4(),
        email="a@b.co",
        scopes=None,
        secret=_SECRET,
        algorithm=_ALG,
        access_ttl_seconds=60,
        refresh_ttl_seconds=600,
        issuer=_ISS,
        audience=_AUD,
    )
    with pytest.raises(TokenError):
        decode_refresh_token(
            pair.access_token,
            secret=_SECRET,
            algorithm=_ALG,
            issuer=_ISS,
            audience=_AUD,
        )
