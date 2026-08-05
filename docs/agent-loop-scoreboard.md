# Agent Loop Capability Scoreboard

- Generated: 2026-07-30T19:17:18+00:00
- Scale: 0-100; partial credit must have a concrete evidence reference.
- Scope: architecture capability prior, not black-box task quality.

| Agent | Context | Durability | PlanVerify | Memory | Scale | Safety | Experience | Total | Evidence date |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Telepace | 15.0 | 15.0 | 19.0 | 8.0 | 10.0 | 10.0 | 19.0 | **96.0** | 2026-07-31 |
| Manus | 10.0 | 14.0 | 13.5 | 9.2 | 10.0 | 8.2 | 16.0 | **81.0** | 2026-07-31 |
| Codex Cloud | 11.0 | 15.0 | 16.2 | 10.0 | 10.0 | 10.0 | 19.0 | **91.2** | 2026-07-31 |

## Interpretation

This table is a parity audit. A higher score means the documented or implemented loop exposes more of the required control surface. It is not acceptable evidence that one agent completes tasks better than another.

The overall winner is declared only by the black-box task protocol in `docs/design/agent-loop-gap-analysis.md`: same task inputs, saved run traces, at least five runs per agent/task, and a confidence-bound win over both baselines.
