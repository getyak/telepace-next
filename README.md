# telepace

Evidence-to-eval infrastructure for AI products.

> Turn one costly production failure, policy correction, or expert judgment into
> a versioned regression case and an enforceable release gate.

## What this is

telepace is an **evidence-to-eval compiler**. It connects the people and systems
that know what “correct” means to the evals that decide whether an AI change can
ship.

The core loop is:

1. **Define correctness** — release decision, capability, authority, boundaries,
   prohibited outcomes, and critical slices.
2. **Collect only missing evidence** — production traces, telemetry, policy
   interpretation, expert corrections, and end-user intent.
3. **Compile an Eval Pack** — replayable cases, observable rubric anchors,
   layered graders, provenance, and a versioned release gate.
4. **Improve continuously** — evidence promotes hypotheses into durable
   regressions; judge disagreements trigger human calibration.

The product ships through three surfaces:

1. **Web workbench** — chat-first correctness contract and evidence compiler.
2. **REST API + Eval Pack JSON** — embed collection and release gating into an
   AI product or CI workflow.
3. **MCP Server** — let Claude, Codex, and other agents create and inspect
   evaluation programs.

## Positioning

- vs generic model prompts: **durable evidence, provenance, judge calibration,
  and release decisions**, not one-off generation.
- vs survey tools: **questions exist only to close a named eval gap**, not to
  collect large samples by default.
- vs benchmark dashboards: **production failures and policy corrections become
  replayable regression cases**, not aggregate scores detached from real harm.
- vs horizontal eval tooling: **vertical correctness recipes** make high-value
  domains fast, concrete, and testable.

## Architecture

```
Ingress (Production trace / Product telemetry / Expert / User / MCP)
    ↓
Correctness Contract (decision / authority / boundaries / prohibited outcomes)
    ↓
Evidence Gap Planner (ask only what is missing)
    ↓
Eval Compiler (cases / rubric / layered graders / release gate)
    ↓
Evidence Collection (web / voice / phone / API)
    ↓
Event Store + Provenance + Versioned Eval Pack
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

Codex users can authenticate the project MCP with
`TELEPACE_MCP_ACCESS_TOKEN`; see the
[Codex → Telepace login and acceptance guide](docs/codex-telepace.md).

> **Behind a SOCKS proxy?** If your shell exports `ALL_PROXY`/`http_proxy`,
> the LLM SDK crashes on startup with a missing-`socksio` error and local
> `curl` hangs. Strip the proxy for the backend process (or install
> `httpx[socks]`). Full walkthrough + an end-to-end
> register → create → respondent self-test:
> [docs/local-fullstack-selftest.md](docs/local-fullstack-selftest.md).

## License

MIT (planned).
