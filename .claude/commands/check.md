# /check — Full Build Verification

Run the complete verification suite for telepace-next and report results.

## Steps

1. Run `pnpm lint` from the project root. Capture exit code and output.
2. Run `pnpm typecheck` from the project root. Capture exit code and output.
3. Run `pnpm build` from the project root. Capture exit code and output.
4. If a `test` script exists in the root `package.json`, also run `pnpm test`. Capture exit code and output.

## Reporting

Summarize results in a table:

| Step | Status | Details |
|------|--------|---------|
| lint | PASS/FAIL | error count or "clean" |
| typecheck | PASS/FAIL | error count or "clean" |
| build | PASS/FAIL | error summary or "success" |
| test | PASS/FAIL/SKIPPED | test count or "no test script" |

If any step fails, list each error that needs fixing with file path and line number.

If all steps pass, confirm: **All checks green. Safe to commit.**
