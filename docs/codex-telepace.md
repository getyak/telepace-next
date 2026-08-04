# Codex → Telepace

The repository configures Telepace as a project MCP server in
`.codex/config.toml`. The server fails closed unless Codex receives a valid
Telepace access token.

## One-time sign-in

Start Telepace, sign in through the product, and export the returned access
token before launching Codex:

```bash
export TELEPACE_MCP_ACCESS_TOKEN="<Telepace access token>"
codex
```

The token value is inherited by the MCP child process through Codex's
`env_vars` allowlist. It is not stored in `.codex/config.toml` or sent as a tool
argument. Password and Google sign-in tokens include `mcp:read` and
`mcp:write`; every campaign-scoped tool also verifies the authenticated tenant.

Inside Codex, a single request can then drive the chain:

```text
登录 Telepace，创建一个研究定价理解的访谈，完善提纲后发布，邀请两位参与者，
持续查看完成进度；有结果后给出带访谈证据的洞察，并把报告发到我的邮箱。
```

Codex will still ask for tool approval unless the user or trusted automation
has configured an approval mode. Telepace does not silently bypass Codex's
confirmation boundary.

## Verified acceptance gate

Run the ten black-box stories:

```bash
uv run python -m eval.codex_stories.runner --require-pass
uv run python -m eval.codex_stories.scoreboard --require-pass
```

The runner uses a fresh signed tenant, invokes the real `codex exec` CLI, and
scores raw MCP traces against Postgres events, projections, transcript evidence,
PII-redacted dispatch events, and provider delivery receipts. A story reaches
99 only when every required assertion passes; the current run and per-story
evidence are in [the scoreboard](codex-user-stories-scoreboard.md).
