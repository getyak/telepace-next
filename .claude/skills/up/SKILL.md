---
name: up
description: |
  One-command dev bring-up for the telepace stack, in correct dependency order:
  preflight (uv/pnpm/docker + deps) → start docker services (postgres :15432,
  redis :16379) → wait until healthy → start backend (:8010) + frontend (:3300).
  Use when asked to "start the app", "run the dev stack", "启动服务", "bring it
  up", "spin up telepace", or "get it running locally".
triggers:
  - start the dev stack
  - run the app locally
  - bring up telepace
  - 启动服务
  - spin up the backend and frontend
allowed-tools:
  - Bash
  - Read
---

# telepace up

Bring up the full local dev stack for **telepace** with correct ordering, so
the backend never starts before postgres/redis are healthy.

## How to run

```bash
scripts/up.sh                 # full bring-up (services → backend → frontend)
scripts/up.sh --services-only # only ensure postgres+redis are healthy
scripts/down.sh               # stop docker services (keeps DB data)
scripts/down.sh --reset       # stop + wipe the postgres volume (destructive)
```

`scripts/up.sh` runs in the **foreground** (backend + frontend). It survives
as long as the shell does; Ctrl+C stops both app processes. Because it blocks,
launch it with `run_in_background: true` when you start it via Bash, then poll
`scripts/doctor.sh --quiet` or `curl -s localhost:8010/healthz`.

## What it does, in order

1. **Preflight** — fail fast if uv / pnpm / docker daemon missing. Auto-runs
   `uv sync` / `pnpm install` if deps are absent.
2. **Services** — `docker compose -f deploy/docker-compose.dev.yml up -d
   postgres redis` (idempotent).
3. **Wait healthy** — polls each container's healthcheck (bounded 60s).
4. **Hand off** — `exec scripts/dev.sh`: backend `uvicorn
   interfaces.rest_api.main:app` on :8010 + `pnpm dev` (frontend) on :3300.

## Endpoints once up

- Backend health: `http://127.0.0.1:8010/healthz`, `/readyz`
- API docs: `http://127.0.0.1:8010/docs`
- Frontend: `http://localhost:3300`

## Key facts

- **Schema is auto-created** on backend startup (`CREATE TABLE IF NOT EXISTS`
  in `build_state()`); there is no alembic step to run.
- **`dev.sh` alone does not start docker services** — it errors out if
  postgres/redis aren't already running. That's exactly the gap `up.sh` fills.
- If a bring-up fails, run the `doctor` skill (`scripts/doctor.sh --fix`) to see
  what's wrong.
- LLM: verify the provider actually works with `python -m scripts.smoke_llm`
  (uses the real API; `provider=mock` needs no key).
---
