# telepace

Voice-native, Agent-first user research infrastructure.

> Your Claude / Cursor / Codex can now interview 100 users while you sleep, and wake up to structured insights it can act on.

## What this is

telepace is a **user research platform** designed for AI agents as the first-class user. Three surfaces:

1. **MCP Server** — Claude / Cursor / Codex call `create_campaign`, `get_insights`, etc.
2. **Web App** — traditional research team dashboard with chat-first study composer
3. **REST API + Webhook** — embed in your own agent or product

## Positioning

- vs Outset / Listen Labs: **Agent-first**, not dashboard-first
- vs Perspective / Voicepanel: **Voice-native** (real-time voice interviews, not text-only)
- vs Tally / Typeform MCP: **Research closed-loop** (moderate + analyze + push back to agent), not form CRUD

## Architecture

```
Ingress (Marketing / Web App / Respondent UI / MCP)
    ↓
Contract Layer (Pydantic — single source of truth)
    ↓
Harness (Orchestrator + Router + Memory + Policies + Observability)
    ↓
Agents (Designer / Interviewer / Analyst / Coordinator)
    ↓
Domain Services (voiceflow / analysis lib / channel workers)
    ↓
Event Store (Postgres append-only) + Projections + pgvector
```

See [docs/architecture.md](docs/architecture.md) for the full design.

## Repo layout

```
core/              domain models, events, protocols (contract layer)
harness/           orchestrator, router, memory, policies
agents/            designer, interviewer, analyst, coordinator
interfaces/        mcp_server, rest_api, realtime
voice/             wrapper around telepace/voiceflow (Go)
analysis/          sentiment, clustering, persona synthesis
storage/           event store + projections + vector
frontend/          single Next.js app (marketing + app + auth + respondent), shared UI
eval/              prompt evals + CI
deploy/            docker-compose, fly.io, github actions
docs/              architecture, agents, protocols, roadmap
```

## Quickstart

One command (starts docker services → backend :8010 → frontend :3300):

```bash
scripts/up.sh          # bring the whole dev stack up
scripts/doctor.sh      # check the environment first (toolchain, ports, services)
```

Or step by step:

```bash
# Backend
uv sync
docker compose -f deploy/docker-compose.dev.yml up -d postgres redis
uvicorn interfaces.rest_api.main:app --reload --host 127.0.0.1 --port 8010

# MCP server
python -m interfaces.mcp_server.server

# Frontend
cd frontend && pnpm install && pnpm dev   # → http://localhost:3300
```

> No migration step: the database schema is created automatically on backend
> startup (`CREATE TABLE IF NOT EXISTS`), so there is no `alembic` to run.

## License

MIT (planned).
