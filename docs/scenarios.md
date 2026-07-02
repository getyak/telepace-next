# 10 User Scenarios — the scorecard we build against

Every subsystem (chat-to-build, voice, multi-channel dispatch, insight) is graded
against these ten stories. Each scenario has a **must-hit list**, a **North-Star
metric**, and a **12-dim rubric**. We beat Listen Labs only when the median
scenario scores ≥ 10.5/12 across the rubric.

## The rubric (per scenario, 12 dims)

Each dim scores 0–12. A "10" means "measurably better than Listen Labs on this dim."

| # | Dim                       | What we measure                                                        |
|---|---------------------------|------------------------------------------------------------------------|
| 1 | **Time-to-first-question**| Seconds from empty canvas → first published question in respondent link |
| 2 | **Build-fluency**         | # of user corrections before the outline reaches "ship-ready"           |
| 3 | **Voice latency**         | End-of-user-speech → assistant voice starts (P50)                       |
| 4 | **Voice groundedness**    | % of assistant turns that reference something the respondent actually said |
| 5 | **Channel coverage**      | Which of {link, email, SMS, outbound-call, inbound-hotline} work E2E    |
| 6 | **Coverage-tracking**     | Are all goals from the outline actually surfaced in the transcript?     |
| 7 | **PII / policy safety**   | Are PII, jailbreaks, out-of-scope answers handled per PolicyStack?      |
| 8 | **Insight quality**       | Judged theme accuracy vs. hand-labeled ground truth                     |
| 9 | **Cost per completion**   | $ spent per completed interview (LLM + STT + TTS + telephony)           |
|10 | **Time-to-insight**       | Interview end → clustered themes visible in `/insights`                 |
|11 | **Ops observability**     | Can an operator see the whole run (events, prompts, costs, latencies)?  |
|12 | **Aesthetic polish**      | Editorial UI, motion, empty-states, keyboard shortcuts, a11y            |

## The ten scenarios

### S1 — Product manager validates a pricing tier
- **Persona**: B2B SaaS PM, 40 interviews needed in 5 days.
- **Flow**: chat-to-build → email dispatch to 200 leads → 40 voice completions → theme cluster + quote wall.
- **Must-hit**: ≥ 40 completions; ≥ 3 themes surface; cost < $2/completion.
- **North-Star**: Time-to-insight ≤ 6 days from empty canvas.

### S2 — Founder discovery interviews before writing a spec
- **Persona**: Solo founder, 8 warm intros.
- **Flow**: chat-to-build → send personalized email links → half go voice, half text → auto-summary per respondent + cross-respondent themes.
- **Must-hit**: Emails render each respondent's name+context; no template smell.
- **North-Star**: Founder can quote lines back to their co-founder within 24h.

### S3 — UX researcher runs an in-product feedback loop
- **Persona**: Sr. UX researcher at mid-size SaaS.
- **Flow**: MCP tool call from an internal Claude Skill spins up a study; embed link in Intercom "was this helpful?" surface; realtime voice for anyone who taps "tell us more".
- **Must-hit**: `campaign.create` + `campaign.get_share_url` MCP tools return in <2s; embed is CSP-safe.
- **North-Star**: MCP-triggered study reaches "first insight" without human touch.

### S4 — Customer success at churn risk
- **Persona**: CS lead, 12 accounts trending down.
- **Flow**: outbound phone (Vapi) from a friendly number; interview 8–12 min; transcript + risk-signal summary pushed to CRM.
- **Must-hit**: Outbound call places within 60s of trigger; summary lands in Salesforce/HubSpot as a note.
- **North-Star**: Save-rate improvement measurable across a 30-day cohort.

### S5 — Consumer app measures onboarding drop-off
- **Persona**: B2C growth PM, 10K weekly signups, wants qualitative signal.
- **Flow**: SMS link to users who dropped at step 3; ultra-short voice interview (90 sec cap); daily digest.
- **Must-hit**: SMS opt-out compliance; 90-sec hard cap enforced; digest is one paragraph, not a wall.
- **North-Star**: PM opens the digest daily without reminders (retained-view D7 ≥ 60%).

### S6 — Post-purchase satisfaction (D2C brand)
- **Persona**: Shopify brand ops.
- **Flow**: post-purchase email → text OR voice → NPS + open-ended → aggregate to brand dashboard weekly.
- **Must-hit**: Email deliverability ≥ 98%; sentiment agrees with NPS ≥ 85% of the time.
- **North-Star**: A weekly brand health page that ops actually shares in Slack.

### S7 — Recruiter panel interview at scale
- **Persona**: research ops running a paid panel.
- **Flow**: recruit 100+ from a screener; screener drops non-qualifiers; qualifiers get calendar link → voice interview; incentives dispatched on completion.
- **Must-hit**: Screener JSON logic executes; incentive webhook fires exactly once per completion.
- **North-Star**: Panel throughput ≥ 40 interviews/day/researcher.

### S8 — Executive pulse (multilingual)
- **Persona**: Chief of Staff, quarterly exec pulse in en/es/zh/ja.
- **Flow**: personalized email → language-detected voice interview → executive summary per language + merged.
- **Must-hit**: Voice STT+TTS quality parity across 4 languages; personalization uses first name.
- **North-Star**: A one-page exec summary that survives legal review.

### S9 — Employee engagement (anonymous)
- **Persona**: People Ops.
- **Flow**: broadcast email → anonymous voice/text interview → aggregate report with quote-level anonymization guaranteed.
- **Must-hit**: No PII in the report; guarantee verifiable in event log.
- **North-Star**: Legal signs off on the report as safe-to-publish internally.

### S10 — Academic longitudinal study
- **Persona**: PhD researcher, N=50, 4 waves over 6 months.
- **Flow**: consented cohort, reminder email each wave, voice interview, theme evolution over time in Insight view.
- **Must-hit**: Same respondent recognized across waves; consent audit trail intact.
- **North-Star**: Publishable table + interactive theme-evolution chart.

## How this file feeds the rest of the system

- `eval/datasets/scenarios/S{n}/` — deterministic seed inputs for that scenario.
- `eval/judges/` — one judge module per rubric dim (S{n} → 12 rubric scores).
- `eval/ci/scoreboard.py` — walks all 10 scenarios, produces a Markdown scoreboard,
  fails CI if median < 10.5 or if any dim regressed vs. last commit.
- `tests/e2e/test_scenario_S{n}.py` — Playwright + FastAPI end-to-end drivers.

The scoreboard is the source of truth. If the scoreboard says we lost, we lost.
