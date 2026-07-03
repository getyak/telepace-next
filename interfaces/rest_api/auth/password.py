"""Password hashing using PBKDF2-HMAC-SHA256 (stdlib, no external deps).

Stored format: `pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>`.
Iterations are read from Settings so cost can be tuned per environment.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os

from core.constants import (
    PASSWORD_HASH_ALGORITHM,
    PASSWORD_HASH_BYTES,
    PASSWORD_SALT_BYTES,
)


def hash_password(password: str, *, iterations: int) -> str:
    """Return an encoded hash suitable for verify_password."""
    if not password:
        raise ValueError("password must not be empty")
    if iterations < 1:
        raise ValueError("iterations must be >= 1")
    salt = os.urandom(PASSWORD_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, iterations, dklen=PASSWORD_HASH_BYTES
    )
    return "$".join(
        (
            PASSWORD_HASH_ALGORITHM,
            str(iterations),
            base64.b64encode(salt).decode("ascii"),
            base64.b64encode(digest).decode("ascii"),
        )
    )


def verify_password(password: str, encoded: str) -> bool:
    """Constant-time verification. Returns False on any malformed input."""
    if not encoded:
        return False
    parts = encoded.split("$")
    if len(parts) != 4 or parts[0] != PASSWORD_HASH_ALGORITHM:
        return False
    try:
        iterations = int(parts[1])
        salt = base64.b64decode(parts[2])
        expected = base64.b64decode(parts[3])
    except (ValueError, base64.binascii.Error):
        return False
    if iterations < 1:
        return False
    computed = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, iterations, dklen=len(expected)
    )
    return hmac.compare_digest(expected, computed)
