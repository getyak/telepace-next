# Protocols

Everything at a system boundary is a Pydantic model. Three categories:

## 1. Commands (`core/protocols/commands.py`)

Written to. Passed to `Harness.handle()`.

- `CreateCampaign(org_id, author_id, title, goal, background, target_completions, budget_usd, channels)`
- `RefineOutline(campaign_id, instruction)`
- `RegisterRespondents(campaign_id, respondents, source)`
- `StartCampaign(campaign_id)`
- `ReplyInInterview(campaign_id, interview_id, text, audio_url)`
- `PushInsights(campaign_id, destination, config)`

Discriminated union: `Command = Annotated[..., Field(discriminator="type")]`.

## 2. Queries (`core/protocols/queries.py`)

Read from. Served from projections (no side effects).

- `GetCampaign(campaign_id)`
- `ListCampaigns(org_id, status?, limit)`
- `GetCampaignProgress(campaign_id)`

## 3. Events (`core/events/schema.py`)

Immutable, append-only, past-tense. All extend `EventBase(id, campaign_id, actor, ts, schema_version, type)`.

Lifecycle:
- Study: `StudyDrafted`, `SpecUpdated`, `CampaignReady`, `CampaignPublished`, `CampaignClosed`
- Recruitment: `InviteDispatched`
- Interview: `RespondentJoined`, `InterviewStarted`, `TurnRecorded`, `InterviewCompleted`, `InterviewAbandoned`
- Analysis: `TranscriptEmbedded`, `ThemeClusterUpdated`, `InsightGenerated`
- Coord: `NotificationSent`
- Policy: `BudgetThresholdCrossed`, `EscalationTriggered`, `PIIRedacted`

Discriminated by the `type` string. `load_event(record)` reconstructs a concrete event from a stored dict via `event_type_registry`.

## 4. MCP tool schemas (`core/protocols/mcp_tools.py`)

Each MCP tool has a Pydantic Input + Output pair, registered in `MCP_TOOL_REGISTRY: dict[name, (InputCls, OutputCls, description)]`.

Every tool is **stateful**:
- `create_campaign` → returns `campaign_id` (persistent handle)
- `get_campaign_progress` → reads projection
- `get_campaign_insights` → reads projection
- `ask_followup` → mines transcripts
- `push_insights` → creates external side-effect + `NotificationSent`

Every Output has a `next_actions: list[str]` field. This is what makes tool-using agents effective: after every call, we tell them what to try next.

## Contract evolution rules

1. **Never remove a field.** Deprecate + ignore.
2. **New fields must have defaults.** Old events still deserialize.
3. **Never rename an event type.** Add a new one; retire the old one silently.
4. **Bump `schema_version`** only if payload semantics changed (rare).

## Frontend mirror

`frontend/packages/protocols` contains hand-written TypeScript Zod schemas that mirror the Pydantic layer. Kept manually in sync — small enough to be OK; if it grows, we'll wire an autogen step.
