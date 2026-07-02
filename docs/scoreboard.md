# Scoreboard

- **Commit**: `unknown` — (no git history)
- **Generated**: 2026-07-02T06:12:24+00:00
- **Fail-under median**: 10.5

| Scenario | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | D10 | D11 | D12 | Median | Trend |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S1 | 12.0 | 12.0 | 11.7 | 12.0 | 12.0 | 9.6 | 12.0 | 6.0 | 12.0 | 12.0 | 6.0 | 9.0 | 12.0 | → |
| S2 | 12.0 | 12.0 | 11.7 | 12.0 | 12.0 | 9.6 | 12.0 | — | 12.0 | 12.0 | 6.0 | 9.0 | 12.0 | → |
| S3 | 12.0 | 12.0 | 11.7 | 12.0 | 12.0 | 9.6 | 12.0 | 6.0 | 12.0 | 12.0 | — | 9.0 | 12.0 | → |
| S4 | 12.0 | 12.0 | 11.7 | 12.0 | 12.0 | 9.6 | 12.0 | 6.0 | 12.0 | 12.0 | 6.0 | 9.0 | 12.0 | → |
| S5 | 12.0 | 12.0 | 11.7 | 9.0 | 12.0 | 9.0 | 12.0 | — | 12.0 | 12.0 | 12.0 | 12.0 | 12.0 | → |
| S6 | 12.0 | 12.0 | 11.7 | 9.0 | 12.0 | 9.6 | 12.0 | 6.0 | 12.0 | 12.0 | — | 12.0 | 12.0 | → |
| S7 | 12.0 | 12.0 | 11.7 | 12.0 | 12.0 | 9.6 | 12.0 | 6.0 | 12.0 | 12.0 | 12.0 | 12.0 | 12.0 | → |
| S8 | 12.0 | 12.0 | 11.7 | 6.0 | 12.0 | 9.0 | 12.0 | 9.6 | 12.0 | 12.0 | 6.0 | 10.0 | 11.9 | → |
| S9 | 12.0 | 12.0 | 11.7 | 12.0 | 12.0 | 9.0 | 12.0 | 6.0 | 12.0 | 12.0 | 6.0 | 9.0 | 12.0 | → |
| S10 | 12.0 | 12.0 | 11.7 | 12.0 | 12.0 | 9.6 | 12.0 | 6.0 | 12.0 | 12.0 | 6.0 | 12.0 | 12.0 | → |

## Rationales (first miss per scenario)

- **S1 D6** (9.6): 4/5 outline goals surfaced in transcript — `eval/results/S1.json#goals_covered_in_transcript`
- **S2 D6** (9.6): 4/5 outline goals surfaced in transcript — `eval/results/S2.json#goals_covered_in_transcript`
- **S3 D6** (9.6): 4/5 outline goals surfaced in transcript — `eval/results/S3.json#goals_covered_in_transcript`
- **S4 D6** (9.6): 4/5 outline goals surfaced in transcript — `eval/results/S4.json#goals_covered_in_transcript`
- **S5 D4** (9.0): deterministic fallback: 3/4 interviewer turns quote respondent keywords — `eval/results/S5.json#transcript`
- **S6 D4** (9.0): The assistant consistently quotes the respondent's words to ground questions, though the repetitive template structure and occasional irrelevant follow-up prevent a perfect score. — `eval/results/S6.json#transcript`
- **S7 D6** (9.6): 4/5 outline goals surfaced in transcript — `eval/results/S7.json#goals_covered_in_transcript`
- **S8 D4** (6.0): deterministic fallback: 2/4 interviewer turns quote respondent keywords — `eval/results/S8.json#transcript`
- **S9 D6** (9.0): 3/4 outline goals surfaced in transcript — `eval/results/S9.json#goals_covered_in_transcript`
- **S10 D6** (9.6): 4/5 outline goals surfaced in transcript — `eval/results/S10.json#goals_covered_in_transcript`
