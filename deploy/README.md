# Deploy

## Local

```bash
docker compose -f deploy/docker-compose.dev.yml up -d
uv sync --extra dev
uvicorn interfaces.rest_api.main:app --reload
```

Optional Claude Desktop MCP config (add to `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "telepace": {
      "command": "python",
      "args": ["-m", "interfaces.mcp_server.server"],
      "env": {
        "TELEPACE_DATABASE_URL": "postgresql://telepace:telepace@localhost:5432/telepace",
        "TELEPACE_ANTHROPIC_API_KEY": "sk-..."
      }
    }
  }
}
```

## Production (Fly.io)

```bash
fly launch --copy-config --dockerfile deploy/Dockerfile.api
fly secrets set \
  TELEPACE_DATABASE_URL=postgresql://... \
  TELEPACE_REDIS_URL=redis://... \
  TELEPACE_ANTHROPIC_API_KEY=sk-...
fly deploy
```

Frontend deploys on Vercel — one project per app: `apps/marketing` (root), `apps/app` (subdomain `app.`), `apps/respondent` (subdomain `r.`).
