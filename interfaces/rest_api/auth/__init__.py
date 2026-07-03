"""Auth subsystem: password hashing, JWT, user repo, FastAPI deps & router.

All configuration flows through `interfaces.rest_api.config.Settings`; nothing
in this package hardcodes secrets, TTLs, algorithms, or password policy.
"""

from interfaces.rest_api.auth.deps import get_current_user, require_current_user
from interfaces.rest_api.auth.jwt import (
    TokenPair,
    decode_access_token,
    issue_token_pair,
)
from interfaces.rest_api.auth.models import (
    AuthUser,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from interfaces.rest_api.auth.password import hash_password, verify_password
from interfaces.rest_api.auth.users_repo import (
    USERS_SCHEMA_SQL,
    UserAlreadyExistsError,
    UserNotFoundError,
    UsersRepo,
)

__all__ = [
    "AuthUser",
    "LoginRequest",
    "RegisterRequest",
    "TokenPair",
    "TokenResponse",
    "USERS_SCHEMA_SQL",
    "UserAlreadyExistsError",
    "UserNotFoundError",
    "UserResponse",
    "UsersRepo",
    "decode_access_token",
    "get_current_user",
    "hash_password",
    "issue_token_pair",
    "require_current_user",
    "verify_password",
]
