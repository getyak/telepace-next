# Architecture

## One-line

telepace is a **voice-native, agent-first user research infrastructure** built as an event-sourced, harness-orchestrated system with three ingress surfaces (MCP, REST, Web UI) sharing a single Pydantic contract layer.

## Six principles

1. **Agent is a first-class user**, human UI is second.
2. **Event-sourced.** Every fact is an append-only event; state is a projection.
3. **Harness owns orchestration**, agents are stateless workers.
4. **Prompt is code** — versioned, PR-reviewed, eval-tested.
5. **Every agent has a tool whitelist** — permission is isolation.
6. **Observable by default** — every LLM call, every decision, traced.

## Layered diagram

```
┌───────── Ingress ─────────┐
│ Marketing │ App │ Respond │
│  Next.js  │Next │  Next   │
│ (3000)    │(3001)│ (3002) │
└─────┬──────────┬─────┬────┘
      │          │     │
      ▼          ▼     ▼
┌───────────────────────────┐
│  Edge: FastAPI + WS       │
│  (interfaces/rest_api)    │
├───────────────────────────┤
│  MCP stdio Server         │
│  (interfaces/mcp_server)  │
└─────────┬─────────────────┘
          ▼
┌───────────────────────────┐
│  Contract Layer (Pydantic)│  core/protocols
│  Command / Query / Events │  core/events
│  Domain Models            │  core/domain
└─────────┬─────────────────┘
          ▼
┌───────────────────────────┐
│      H A R N E S S        │
│  Orchestrator             │
│  Router → Agent name      │
│  Memory (Redis)           │
│  Policies (budget/pii/    │
│            escalation)    │
│  Observability            │
└──┬──────┬──────┬──────┬───┘
   ▼      ▼      ▼      ▼
 Design Interv Analyst Coord
 Agent  iewer  Agent   inator
        Agent
   │      │      │      │
   └──────┴───┬──┴──────┘
              ▼
     Domain Services
  voiceflow (Go)  · analysis lib · channel workers
              │
              ▼
   Event Store (Postgres append-only)
   Projections (campaigns, progress)
   pgvector · R2 (audio/PDF)
```

## Ingress → Command → Event flow

```
User / Agent
  │  create_campaign(...)
  ▼
Contract: CreateCampaign
  │
  ▼
Harness.handle(cmd)
  ├─ Policies.pre(cmd, ctx)
  ├─ Router.route(cmd) → "designer"
  ├─ DesignerAgent.run(cmd, ctx, harness)
  │    → AgentResult(
  │        events=[StudyDrafted, SpecUpdated],
  │        state_delta={"budget_usd": 100.0},
  │        response={"campaign_id": "..."})
  ├─ EventStore.append_many(result.events)
  ├─ Memory.update(cid, state_delta)
  ├─ Policies.observe(result)
  └─ return HarnessResponse(ok=True, result=...)
```

The MCP tool `create_campaign` is a thin wrapper: parse the JSON input with the Pydantic tool schema, translate to a `CreateCampaign` command, hand to Harness, translate the result back to the tool's Output schema with `next_actions` hints appended for the calling agent.

## Data ownership

| Data | Owner | Store |
|---|---|---|
| Events | Harness (write) | Postgres `events` (append-only) |
| Campaign snapshot | CampaignProjector | Postgres `campaigns` |
| Progress counters | CampaignProjector | Postgres `progress_snapshots` |
| Campaign short-term memory | Harness | Redis `campaign:{id}:memory` (TTL 3600) |
| Audio / transcripts / PDF | Channel workers, Analyst | R2 (S3-compatible) |
| Semantic search | Analyst | Postgres `pgvector` |

## Language choices

| Concern | Language | Why |
|---|---|---|
| Realtime voice | Go (voiceflow) | Existing; low-latency multi-provider STT/TTS pipeline |
| Harness + agents + API | Python 3.12 | LLM SDK ecosystem; Pydantic; FastAPI async |
| All three web apps | TypeScript + Next.js 15 (RSC) | React ecosystem; SSG for marketing; RSC for app |
| Design system | TypeScript + Tailwind | Colocated with apps; token-driven |

## What's intentionally not here

- **LangChain / LangGraph** — the harness is ~300 lines of custom Python. Abstraction lock-in is worse than a bit of glue code.
- **Kafka / Kinesis** — Postgres event log + LISTEN/NOTIFY tail is enough until $50k MRR.
- **GraphQL** — REST + typed Pydantic contracts + a small number of endpoints is enough.
- **Kubernetes** — Fly.io per-region single container; scale up when it starts to bite.

See also: `agents.md`, `protocols.md`, `roadmap.md`, `design-system.md`.
