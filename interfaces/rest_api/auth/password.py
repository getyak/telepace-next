"""Password hashing using PBKDF2-HMAC-SHA256 (stdlib, no external deps).

Stored format: `pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>`.
Iterations are read from Settings so cost can be tuned per environment.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os

_ALGORITHM = "pbkdf2_sha256"
_SALT_BYTES = 16
_HASH_BYTES = 32
# PBKDF2 iteration count multiplier — each `password_hash_rounds` step is 10k iterations.
# 12 rounds -> 120_000 iterations (OWASP 2023 recommendation for PBKDF2-SHA256 is >= 600_000,
# but many small deployments run this at 120k for latency; env var can push it higher).
_ITERATIONS_PER_ROUND = 10_000


def _iterations(rounds: int) -> int:
    if rounds < 1:
        raise ValueError("password_hash_rounds must be >= 1")
    return rounds * _ITERATIONS_PER_ROUND


def hash_password(password: str, *, rounds: int) -> str:
    """Return an encoded hash suitable for verify_password."""
    if not password:
        raise ValueError("password must not be empty")
    salt = os.urandom(_SALT_BYTES)
    iterations = _iterations(rounds)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, iterations, dklen=_HASH_BYTES
    )
    return "$".join(
        (
            _ALGORITHM,
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
    if len(parts) != 4 or parts[0] != _ALGORITHM:
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
