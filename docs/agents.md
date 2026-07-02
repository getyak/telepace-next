# Agents & Loops

## Roster

| Agent | Role | Routed by | Tools |
|---|---|---|---|
| **Designer** | Converts researcher intent into a `CampaignSpec` via chat | `create_campaign`, `refine_outline` | `draft_outline`, `revise_outline`, `estimate_cost` |
| **Interviewer** | Moderates one interview session (text / voice / phone) | `reply_in_interview` | `ask`, `probe`, `acknowledge_and_move`, `wrap_up`, `flag_concern` |
| **Analyst** | Synthesizes themes/verbatims/personas from transcripts | event-driven (`InterviewCompleted`) + on-demand from MCP `get_campaign_insights` | `embed_transcript`, `cluster_themes`, `extract_verbatims`, `synthesize_persona` |
| **Coordinator** | Fans out invitations, notifies on milestones, pushes insights | `register_respondents`, `start_campaign`, `push_insights` | `send_email`, `place_call`, `notify_slack`, `push_notion` |

## Four Agent Loops

### Loop A — Designer Loop (conversational study design)

```
Researcher: "I want to understand pricing sensitivity"
      │
      ▼
Harness.handle(CreateCampaign)
      │
      ▼
Designer draft (LLM) → SpecUpdated event → outline preview
      │
      ▼ (researcher iterates)
Harness.handle(RefineOutline("cut Q3, add screener"))
      │
      ▼
Designer LLM → SpecUpdated patch → outline updates in canvas
      │
      ▼ (once satisfied)
Coordinator.start_campaign → CampaignPublished
```

Exit condition: `outline.items.length >= 5 AND user confirms`.

### Loop B — Interviewer Loop (one session)

```
Respondent joins → RespondentJoined event
      │
      ▼
while not done:
  Respondent turn → Harness.handle(ReplyInInterview(text))
      → PIIPolicy redacts
      → InterviewerAgent decides action (ask | probe | acknowledge_and_move | wrap_up)
      → TurnRecorded events (respondent + interviewer)
      → Updates memory: interview_history, outline_coverage
  if action.kind == "wrap_up":
      → InterviewCompleted event
      → done
```

Exit conditions (any of):
- Every outline item has `coverage >= 0.7`
- Time budget exceeded
- Respondent asks to stop
- `EscalationPolicy` triggers `high` severity

### Loop C — Analyst Loop (batch + incremental)

Runs as a background worker (see `interfaces/rest_api/worker.py`) tailing the event store:

```
subscribe to events:
  on InterviewCompleted(iid) →
      load transcripts(iid)
      AnalystAgent.synthesize(campaign_id, [transcript])
      → InsightGenerated events (themes / verbatims / concerns / persona)
```

For campaigns with N≥5 completed interviews, cross-interview cluster synthesis runs every hour.

### Loop D — Coordinator Loop (event-driven)

Subscribes to events and reacts:

| Event | Reaction |
|---|---|
| `InviteDispatched` | Coordinator monitors delivery receipts |
| `InterviewCompleted` | Update spent_usd; notify researcher if progress crosses target |
| `BudgetThresholdCrossed(threshold=0.8)` | Notify researcher, switch to Haiku model for new interviews |
| `EscalationTriggered(severity="high")` | Ping researcher within 5 minutes |
| `InsightGenerated(confidence>=0.8)` | Optional Slack notification |

## Policies

All policies apply pre-command (deny/emit) and post-result (observe/emit).

| Policy | Deny condition | Emits |
|---|---|---|
| `BudgetPolicy` | `spent >= budget` | `BudgetThresholdCrossed` at 0.8 and 1.0 |
| `PIIPolicy` | (never denies; sanitizes in-place) | `PIIRedacted` with fields list |
| `EscalationPolicy` | (never denies; observes) | `EscalationTriggered` with severity |

## Prompt versioning

Every agent's system prompt lives at `agents/{name}/prompts/v{N}.md`. Change prompts via PR, and CI runs eval datasets (`eval/`) — regressions block merge.

## Adding a new Agent

1. Create `agents/<name>/{prompts/v1.md, main.py, __init__.py}`.
2. Implement `run(command, context, harness) -> AgentResult`.
3. Register in `interfaces/rest_api/deps.py` and `interfaces/mcp_server/server.py`.
4. Add a routing entry in `harness/router.py`.
5. Add tool whitelist and an eval dataset.
