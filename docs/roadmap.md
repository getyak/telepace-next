# Roadmap

## 12-week MVP → launch

### Phase 1 — Foundation (weeks 1–2) ✅ scaffolded
- Contract layer, event store, harness
- MCP server v1 with 5 tools
- FastAPI REST + WebSocket, background worker
- Marketing site v0 with waitlist

### Phase 2 — Designer & Interviewer text loop (weeks 3–4)
- Designer LLM chat-to-outline
- Interviewer text loop with coverage tracking
- Chat+canvas 2-pane in `apps/app`
- Respondent text UI in `apps/respondent`

### Phase 3 — Voice (weeks 5–6)
- Wire voiceflow (Go, existing) as gRPC domain service
- Browser voice via WebRTC + STT stream → InterviewerAgent
- Hero live-demo on marketing site

### Phase 4 — Analyst + Insight (weeks 7–8)
- pgvector embeddings
- Theme clustering (batch + incremental)
- Insight UI + Notion / Linear integrations

### Phase 5 — Channel expansion (weeks 9–10)
- Vapi outbound phone (custom LLM webhook → Interviewer)
- Inbound hotline
- Resend batch email dispatch
- Analytics dashboard

### Phase 6 — Monetization + Launch (weeks 11–12)
- Stripe billing (Free / Pro / Team / Enterprise)
- MCP v2 with auth + rate limits
- Claude Skill package
- Product Hunt + HN + Anthropic MCP directory launch

## Beyond MVP

- **Enterprise self-host** (SOC2, VPC deploy, SSO)
- **Recruiter panel** — first-party respondent pool via partnerships
- **Longitudinal studies** — repeat interviews of the same respondent over time
- **Fine-tuned Interviewer** on our own successful transcripts
- **Multi-language TTS/STT** — Japanese, Simplified Chinese, Portuguese

## Non-goals (explicit)

- We are not a survey tool. Structured/multiple-choice questions are out of scope.
- We are not a general-purpose form builder. Tally / Typeform own that market.
- We are not selling to enterprise research vendors (Qualtrics / SurveyMonkey buyer base). We're going bottom-up via IC PMs and independent researchers.
