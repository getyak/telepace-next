#!/usr/bin/env bash
# telepace up — one-command dev bring-up with correct dependency ordering.
#
#   1. preflight (toolchain + deps)                      [fails fast]
#   2. start docker dev services (postgres + redis)      [idempotent]
#   3. wait until both are healthy                        [bounded]
#   4. hand off to scripts/dev.sh (backend :8010 + frontend :3300)
#
# Ctrl+C stops the foreground backend/frontend (docker services stay up so
# the next start is instant; stop them with `scripts/down.sh`).
#
# Usage:
#   scripts/up.sh                 # full bring-up
#   scripts/up.sh --services-only # only ensure postgres+redis are healthy

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE="deploy/docker-compose.dev.yml"
SERVICES_ONLY=0
[[ "${1:-}" == "--services-only" ]] && SERVICES_ONLY=1

log() { printf '[up] %s\n' "$1"; }

# --- 1. preflight (toolchain + deps only; services handled below) ----------
log "preflight checks…"
if ! command -v uv >/dev/null 2>&1; then
  echo "[up] uv not found — install: curl -LsSf https://astral.sh/uv/install.sh | sh" >&2; exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "[up] pnpm not found — install: npm i -g pnpm@9.14.0" >&2; exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "[up] docker daemon not running — start Docker Desktop / colima" >&2; exit 1
fi
[[ -d .venv ]] || { log "installing backend deps (uv sync)…"; uv sync; }
[[ -d frontend/apps/app/node_modules ]] || { log "installing frontend deps (pnpm install)…"; (cd frontend && pnpm install); }

# --- 2. start docker services ----------------------------------------------
log "starting postgres + redis…"
docker compose -f "$COMPOSE" up -d postgres redis

# --- 3. wait for healthy ----------------------------------------------------
wait_healthy() {
  local svc="$1" tries=0 max=60 cid health
  while (( tries < max )); do
    cid="$(docker compose -f "$COMPOSE" ps -q "$svc" 2>/dev/null)"
    if [[ -n "$cid" ]]; then
      health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo unknown)"
      [[ "$health" == "healthy" ]] && { log "$svc healthy"; return 0; }
    fi
    tries=$((tries+1)); sleep 1
  done
  echo "[up] $svc did not become healthy in ${max}s" >&2; return 1
}
wait_healthy postgres
wait_healthy redis

if [[ $SERVICES_ONLY -eq 1 ]]; then
  log "services ready (postgres :15432, redis :16379). Backend/frontend not started (--services-only)."
  exit 0
fi

# --- 4. hand off to dev.sh --------------------------------------------------
log "starting backend :8010 + frontend :3300 (Ctrl+C to stop)…"
exec scripts/dev.sh
