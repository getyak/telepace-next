#!/usr/bin/env bash
# telepace dev launcher — starts backend (FastAPI @ 8010) and frontend
# (Next.js @ 3300) in the foreground of the caller's terminal so the
# processes survive as long as the shell does. Ctrl+C stops both.
#
# Prereqs (once):
#   docker compose -f deploy/docker-compose.dev.yml up -d postgres redis
#   uv sync
#   (cd frontend && pnpm install)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# --- Load .env if present (backend reads pydantic-settings from env)
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# --- SOCKS proxy (all_proxy=socks5://...) breaks httpx unless `socksio`
# is installed. Backend does not need a proxy for localhost — strip it.
unset all_proxy ALL_PROXY http_proxy HTTP_PROXY https_proxy HTTPS_PROXY

# --- Sanity: docker deps
if ! docker compose -f deploy/docker-compose.dev.yml ps --status running \
    --services 2>/dev/null | grep -qE '^(postgres|redis)$'; then
  echo "[dev.sh] postgres/redis are not running. Start them with:" >&2
  echo "  docker compose -f deploy/docker-compose.dev.yml up -d postgres redis" >&2
  exit 1
fi

# --- Sanity: ports
for port in 8010 3300; do
  if lsof -iTCP:"$port" -sTCP:LISTEN -Pn >/dev/null 2>&1; then
    echo "[dev.sh] port $port already in use — free it before starting" >&2
    lsof -iTCP:"$port" -sTCP:LISTEN -Pn >&2 || true
    exit 1
  fi
done

pids=()
cleanup() {
  echo ""
  echo "[dev.sh] stopping…"
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait "${pids[@]}" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "[dev.sh] starting backend → http://127.0.0.1:8010"
uv run --project "$REPO_ROOT" \
  uvicorn interfaces.rest_api.main:app \
  --host 127.0.0.1 --port 8010 &
pids+=($!)

echo "[dev.sh] starting frontend → http://localhost:3300"
(
  cd "$REPO_ROOT/frontend/apps/app"
  pnpm dev
) &
pids+=($!)

echo "[dev.sh] both processes running. Ctrl+C to stop."
wait
