# telepace

Follow `README.md`, `docs/architecture.md`, and `docs/protocols.md`. Preserve the
separation between immutable source evidence and its redacted presentation.

## Code Review Rules

- Flag any path that promotes a hypothesis into a regression case, claim, or
  release decision without immutable provenance, observable rubric anchors,
  and the required human calibration or authority.
- Flag interview, transcript, report, event, or model-input changes that can
  collect without consent, publish PII, rewrite raw evidence during redaction,
  or lose the consent and redaction audit trail.
- Flag Eval paths that can report full coverage or a passing gate after missing
  evidence, a skipped provider, exhausted retries, unparseable output, or a
  judge crash; deterministic fallback must stay explicit and comparable.
