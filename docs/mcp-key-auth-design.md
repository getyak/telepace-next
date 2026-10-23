# Remote MCP API keys (T-308)

Remote clients can call the existing MCP tools over Streamable HTTP with a
revocable API key. The stdio server retains its existing JWT authentication,
read/write scopes, tenant checks, and lifecycle.

## Credential storage

`ApiKeysRepo` generates a URL-safe secret from at least 32 random bytes. The
creation response returns the plaintext once; Postgres stores only its SHA-256
digest, display prefix, owner/org, scopes, expiry, activity, and revocation
metadata. Keys are never recoverable through the list endpoint and the
one-time secret is excluded from the creation result's repr. Key responses
use `Cache-Control: no-store`.

Startup creates the additive `api_keys` table using the project's existing
startup-schema convention. This change does not run a deployment or migration
against an existing environment.

Verification checks the digest, active flag, null revocation timestamp, and
expiry in one SQL query on every HTTP request. There is no authentication
cache: the next request after revocation is rejected. Updating last-used is
best effort and does not change the authentication decision.

Prefixes `tp_live_` and `tp_test_` label keys; both still require a valid row in
the configured database. Prefixes alone do not isolate deployment environments.
REST issuance creates `tp_live_` keys.

## Scope and tenant boundaries

| Tool | Required API-key scope |
|---|---|
| `get_session` | `session:read` |
| `list_campaigns`, `get_campaign_progress` | `campaigns:read` |
| `create_campaign`, `refine_outline`, `start_campaign` | `campaigns:write` |
| `get_campaign_insights`, `ask_followup` | `insights:read` |
| `push_insights` | `insights:push` |
| `dispatch_invites` | `invites:send` |

Exact scopes, `<namespace>:*`, and `*` are supported. Every registry entry must
have a required scope. Empty grants expose no tools. `tools/list` filters the
surface and `tools/call` checks permission again before dispatch.

Each request carries its own principal through a context variable, reset in a
finally block. Tool identity comes from the verified key, not request arguments
or default org settings. Existing campaign ownership checks run before any
campaign-scoped handler. Completed calls synchronize projections through the
same helper used by stdio. HTTP reuses REST's running AppState rather than
opening another Harness, database pool, or Redis connection.

## Management API

The existing signed user JWT authenticates all management requests, even when
REST development fallback is enabled. An API key cannot manage other keys.

| Route | Permission and result |
|---|---|
| `POST /v1/api-keys` | `mcp:write`; name, explicit scopes, optional 1–3650 day expiry; one-time secret |
| `GET /v1/api-keys` | `mcp:read` or `mcp:write`; current org only, no secret/hash |
| `DELETE /v1/api-keys/{id}` | `mcp:write`; org-scoped revocation; another org's id returns 404 |

A write-only JWT cannot delegate read access through concrete or wildcard
key grants. Listing/revocation follows the current org ownership model; this
change does not introduce team roles or a frontend key-management screen.

## HTTP lifecycle and configuration

`TELEPACE_MCP_HTTP_ENABLED=true` mounts the transport at `/mcp/`; it is disabled
by default. API-key verification always runs, including when
`TELEPACE_AUTH_ENABLED=false`. Missing, malformed, duplicate, unknown, expired,
or revoked credentials fail before MCP dispatch. Scope failures are MCP tool
errors carried by the JSON-RPC response. Browser Origin headers must match the
configured CORS origins, including the existing explicit localhost port rule.

`TELEPACE_API_KEY_DEFAULT_EXPIRY_DAYS` optionally sets issuance's default
lifetime (1–3650 days). Omission permits non-expiring keys that remain
revocable. Do not put credentials in URLs or tool arguments. Rate limiting,
rotation UI, and audit-event export remain separate work.

## Validation

Pure tests cover HTTP authentication, scoped visibility and calls, immediate
revocation, concurrent tenant contexts, cross-tenant campaign rejection, origin
and duplicate-header checks, JWT scope delegation, response secrecy, and stdio
JWT regressions.

Database tests require an explicit `TELEPACE_TEST_DATABASE_URL` pointing to a
loopback database whose name begins `telepace_test`. They never fall back to a
configured application database. They exercise real create/verify/expiry/
wrong-org-revoke/revoke SQL and JWT-authenticated management requests.
