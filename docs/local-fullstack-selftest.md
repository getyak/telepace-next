# Local full-stack self-test

Bring the whole stack up locally and walk the real user journey —
**register → create a study → answer as a respondent** — end to end. Written
so a newcomer can run it once and know the environment works.

If you only want the stack running, `scripts/up.sh` does everything below in
one command. This guide exists for the two things that trip people up:
the **SOCKS-proxy trap** that silently kills the backend, and the
**dependency containers** the backend needs before it will start.

---

## 0. Prerequisites

| Tool | Install |
|------|---------|
| `uv` (Python) | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| `pnpm` 9.x | `npm i -g pnpm@9.14.0` |
| Docker | Docker Desktop or colima, daemon running |

Ports used (host → container): Postgres `15432→5432`, Redis `16379→6379`,
backend `8010`, frontend `3300`. Nothing else should occupy them.

---

## 1. Start the dependency containers first

The backend connects to Postgres and Redis on startup and **fails fast** if
they are not up. Start them before anything else:

```bash
docker compose -f deploy/docker-compose.dev.yml up -d postgres redis
```

Confirm both are healthy:

```bash
docker compose -f deploy/docker-compose.dev.yml ps
```

The schema is created automatically on backend startup
(`CREATE TABLE IF NOT EXISTS`) — there is **no migration step**, no `alembic`.

---

## 2. ⚠️ The SOCKS-proxy trap (read this before starting the backend)

If your shell exports a SOCKS proxy — common on machines behind a corporate
VPN or a local proxy like `ALL_PROXY=socks5://…` — the OpenAI/OpenRouter SDK
tries to route through it and crashes on startup with:

```
ImportError: Using SOCKS proxy, but the 'socksio' package is not installed.
```

There are two fixes; pick one:

**A. Strip the proxy for the backend process (recommended for a quick run):**

```bash
env -u ALL_PROXY -u all_proxy \
    -u HTTP_PROXY -u http_proxy \
    -u HTTPS_PROXY -u https_proxy \
    -u NO_PROXY -u no_proxy \
  uvicorn interfaces.rest_api.main:app --reload --host 127.0.0.1 --port 8010
```

**B. Or install SOCKS support so the SDK can use the proxy:**

```bash
uv pip install "httpx[socks]"
```

The same trap bites any `curl` to localhost — a SOCKS proxy will try to
tunnel `127.0.0.1` too. Always pass `--noproxy "*"` when curling local
services:

```bash
curl --noproxy "*" http://127.0.0.1:8010/healthz   # liveness; /readyz for readiness
```

---

## 3. Start the backend and frontend

```bash
# Backend (with the proxy stripped as in §2A)
uv sync
env -u ALL_PROXY -u all_proxy -u HTTP_PROXY -u http_proxy \
    -u HTTPS_PROXY -u https_proxy -u NO_PROXY -u no_proxy \
  uvicorn interfaces.rest_api.main:app --reload --host 127.0.0.1 --port 8010

# Frontend (separate terminal)
cd frontend && pnpm install && pnpm dev   # → http://localhost:3300
```

### Real LLM vs mock

The backend defaults to `llm_provider="mock"`, so study creation works
offline but returns canned outlines. For the **real** design → outline
experience, set in `.env`:

```dotenv
TELEPACE_LLM_PROVIDER=openrouter
TELEPACE_OPENROUTER_API_KEY=sk-or-…
```

Smoke-test the key without touching the app:

```bash
env -u ALL_PROXY -u all_proxy -u HTTP_PROXY -u http_proxy \
    -u HTTPS_PROXY -u https_proxy -u NO_PROXY -u no_proxy \
  .venv/bin/python -m scripts.smoke_llm
```

---

## 4. Walk the full journey

The frontend talks to the backend through its own BFF
(`/api/auth/*`, `/api/proxy/*`) and keeps the session in **httpOnly**
cookies — so `curl` against the frontend, not the backend, mirrors what the
browser does.

**Register a fresh user** (gets its own isolated org — see [T-501]):

```bash
curl --noproxy "*" -c /tmp/tp-cookies.txt \
  -X POST http://127.0.0.1:3300/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"me@test.dev","password":"Secret123!"}'
# → {"ok":true}   and tp_access / tp_refresh cookies are set
```

Then in the browser at <http://localhost:3300/en>:

1. **Register / sign in** — a brand-new account lands on an empty
   `/studies` ("No studies yet"). It must **not** show anyone else's
   studies; if it does, the org isolation regressed.
2. **Create a study** — `/studies/new`, describe a research goal in the
   design chat, let it draft the outline. With a real LLM key this produces
   a publishable discussion guide; with mock it returns a canned one.
3. **Answer as a respondent** — open the study's respondent link
   `/{locale}/r/{campaignId}`, choose "Start with text", and answer a turn.
   The host messages must be in the study's language and the transcript
   must advance.

If all three work, the local full stack is healthy.

---

## 5. Housekeeping & troubleshooting

- **Clean default-org test cruft** (pre-[T-501] leftovers):
  `python -m scripts.clean_default_org` (dry-run) then `--apply`.
- **Environment doctor**: `scripts/doctor.sh` checks toolchain, ports, and
  container health.
- **Stop everything**: `scripts/down.sh` (containers stay unless stopped).
- **Backend won't start, `socksio` error** → §2.
- **`curl` to localhost hangs or 502s** → missing `--noproxy "*"` (§2).
- **Backend exits immediately** → Postgres/Redis not up yet (§1).
- **Study creation spins forever** → check the LLM key / provider (§3); the
  UI now times out and offers a retry rather than hanging (see [T-504]).
