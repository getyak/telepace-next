---
name: doctor
description: |
  Environment & readiness check for the telepace dev stack. Verifies toolchain
  (uv/pnpm/docker), dependency install state, .env + LLM provider config, that
  the docker dev services (postgres :15432, redis :16379) are running & healthy,
  and that app ports 8010/3300 are free. Use when asked to "check my env",
  "why won't it start", "doctor", "环境检测", "diagnose the dev setup", or before
  starting the stack. Read-only — never mutates anything.
triggers:
  - check environment
  - env doctor
  - diagnose dev setup
  - why won't the backend start
  - 环境检测
allowed-tools:
  - Bash
  - Read
---

# telepace doctor

Diagnose the local dev environment for **telepace** (Python/uv backend on
:8010, pnpm Next.js frontend on :3300, postgres+redis via docker).

## How to run

```bash
scripts/doctor.sh          # full human-readable report
scripts/doctor.sh --fix    # append the exact fix command under each failure
scripts/doctor.sh --quiet  # only failures + final verdict (for scripting)
```

Exit code `0` = ready to start (warnings allowed); `1` = at least one critical
issue. Prefer running with `--fix` so the user sees copy-pasteable remedies.

## What it checks

| Group | Critical (✗) | Warning (!) |
|-------|--------------|-------------|
| Toolchain | uv / pnpm / docker daemon missing | — |
| Dependencies | `.venv` or `frontend/apps/app/node_modules` missing | root deps present but app deps missing |
| Configuration | provider≠mock but API key unset/placeholder | no `.env` (falls back to defaults) |
| Dev services | postgres/redis not running | running but not yet healthy |
| Ports | app port 8010/3300 already in use | service port 15432/16379 not bound |

## Key facts for interpreting results

- **`.env` is optional.** Every `Settings` field has a default, so a missing
  `.env` is a warning, not an error — the backend runs against localhost
  15432/16379 with `provider=mock`.
- **No migrations to run.** There is no alembic. The schema is created on
  backend startup via `CREATE TABLE IF NOT EXISTS` in `build_state()`
  (`interfaces/rest_api/deps.py`). Do **not** tell the user to run
  `alembic upgrade head`.
- **Service ports are 15432 / 16379**, not the container-internal 5432/6379
  (see `deploy/docker-compose.dev.yml`).

## After doctor passes

Hand off to the `up` skill (or tell the user to run `scripts/up.sh`). If only
the dev services are down, `scripts/up.sh --services-only` fixes that without
starting the app processes.
