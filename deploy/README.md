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

## Production API and workers (Fly.io)

```bash
fly launch --copy-config --dockerfile deploy/Dockerfile.api
fly secrets set \
  TELEPACE_DATABASE_URL=postgresql://... \
  TELEPACE_REDIS_URL=redis://... \
  TELEPACE_ANTHROPIC_API_KEY=sk-...
fly deploy
```

Keep FastAPI, WebSockets, Postgres, Redis, and the analysis worker on a
long-running service. The respondent interview uses persistent WebSockets and
completion analysis runs after the request has ended, so these processes do not
belong in Netlify Functions.

## Frontend (Netlify)

The root `netlify.toml` builds the single Next.js app in the pnpm monorepo. It
serves marketing, auth, the research dashboard, respondent routes, the
versioned `/embed/telepace-interview.js` Web Component, and the DOM-free
`/embed/telepace-interview-headless.js` SDK.

Set these values in the Netlify project environment:

```text
NEXT_PUBLIC_API_BASE_URL=https://api.telepace.example
NEXT_PUBLIC_WS_BASE_URL=wss://api.telepace.example
TELEPACE_EMBED_ALLOWED_ORIGINS=https://your-site.example,https://deploy-preview.example
```

`NEXT_PUBLIC_*` values are public browser configuration, not secrets. Keep LLM
keys, database credentials, and JWT secrets only on the API deployment. Add the
final Blog origin to both API allowlists:

```text
TELEPACE_CORS_ALLOW_ORIGINS=https://telepace.example,https://your-blog.example
TELEPACE_EMBED_ALLOWED_ORIGINS=https://your-blog.example
```

The Headless SDK first requests a short-lived anonymous session over HTTPS,
then opens the persistent WebSocket directly against the API. The token is sent
in the socket's first authentication frame, never in the URL or access logs,
and is consumed once. It is bound to the campaign, source, consent method, and
browser Origin. Netlify Functions do not proxy the socket and no private
credential is shipped to the browser.

For the cubxxw About integration, publish the study and set this environment
value on the blog's Netlify project:

```text
HUGO_PARAMS_TELEPACEABOUTCAMPAIGNID=<published-campaign-uuid>
HUGO_PARAMS_TELEPACEEMBEDBASEURL=https://telepace.cubxxw.com
HUGO_PARAMS_TELEPACEAPIBASEURL=https://api.telepace.cubxxw.com
HUGO_PARAMS_TELEPACEWSBASEURL=wss://api.telepace.cubxxw.com
```

The Blog loads the Headless SDK only after a visitor chooses a feedback angle.
Consent, messages, progress, completion, and errors remain in the Blog DOM.
The full Next.js respondent runtime and iframe are not loaded.
