# telepace-next

## Project Overview

AI-driven user research / intelligent interview platform. Voice-native, Agent-first.

## Tech Stack

- **Framework**: Next.js 15.5 / React 18
- **i18n**: next-intl (use-intl)
- **Package Manager**: pnpm
- **Frontend Path**: `frontend/apps/app/`

## Execution Discipline

1. **Plan first**: Before starting any task, enter plan mode (`/plan`) to produce an approach. Get approval before writing code.
2. **One task at a time**: Never work on multiple TASKS.md items simultaneously.
3. **Verify before commit**: After implementation, run the full check suite until all green:
   ```bash
   pnpm lint && pnpm typecheck && pnpm build
   ```
   If tests exist, also run `pnpm test`. All must pass before committing.
4. **Commit convention**: Each commit message must include the task number from TASKS.md. Format: `fix(scope): description [T-XXX]` or `feat(scope): description [T-XXX]`.
5. **Update TASKS.md on completion**: After a successful commit, mark the corresponding item as `[x]` in TASKS.md and append a progress line at the bottom (date + task ID + commit hash).
6. **Verify with /check**: Run the `/check` command (`.claude/commands/check.md`) to validate the full suite before committing.
7. **Independent verification**: For non-trivial tasks, spawn the verifier agent (`.claude/agents/verifier.md`) to independently review against acceptance criteria before marking done.

## Key Directories

- `frontend/apps/app/src/` — main Next.js app source
- `frontend/apps/app/messages/` — i18n message files (en/, zh/)
- `frontend/packages/` — shared packages (ui, icons, etc.)
- `TASKS.md` — execution checklist derived from PRD
- `telepace-vs-listenlabs-PRD.md` — competitive analysis & product requirements
