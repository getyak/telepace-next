#!/usr/bin/env bash
# telepace doctor — environment & readiness check.
#
# Verifies everything `scripts/dev.sh` needs before it can start the stack:
# toolchain (uv/pnpm/docker), the docker dev services (postgres/redis) and
# their readiness, port availability (8010/3300/15432/16379), .env presence,
# backend/frontend dependency install state, and the configured LLM provider.
#
# Exit codes:
#   0  all critical checks pass (warnings allowed)
#   1  at least one critical check failed
#
# Usage:
#   scripts/doctor.sh            # human-readable report
#   scripts/doctor.sh --quiet    # only print failures + final verdict
#   scripts/doctor.sh --fix      # print the exact commands to fix each failure

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

QUIET=0
SHOW_FIX=0
for arg in "$@"; do
  case "$arg" in
    --quiet) QUIET=1 ;;
    --fix)   SHOW_FIX=1 ;;
  esac
done

# --- colors (disabled when not a tty) --------------------------------------
if [[ -t 1 ]]; then
  R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; B=$'\033[34m'; DIM=$'\033[2m'; NC=$'\033[0m'
else
  R=''; G=''; Y=''; B=''; DIM=''; NC=''
fi

FAIL=0
WARN=0

ok()      { [[ $QUIET -eq 1 ]] || printf '  %s✓%s %s\n' "$G" "$NC" "$1"; }
warn()    { WARN=$((WARN+1)); printf '  %s!%s %s\n' "$Y" "$NC" "$1"; [[ -n "${2:-}" && $SHOW_FIX -eq 1 ]] && printf '    %s↳ %s%s\n' "$DIM" "$2" "$NC"; }
bad()     { FAIL=$((FAIL+1)); printf '  %s✗%s %s\n' "$R" "$NC" "$1"; [[ -n "${2:-}" && $SHOW_FIX -eq 1 ]] && printf '    %s↳ %s%s\n' "$DIM" "$2" "$NC"; }
section() { [[ $QUIET -eq 1 ]] || printf '\n%s%s%s\n' "$B" "$1" "$NC"; }

port_busy() { lsof -iTCP:"$1" -sTCP:LISTEN -Pn >/dev/null 2>&1; }

# --- 1. toolchain ----------------------------------------------------------
section "Toolchain"
if command -v uv >/dev/null 2>&1; then
  ok "uv $(uv --version 2>/dev/null | awk '{print $2}')"
else
  bad "uv not found" "curl -LsSf https://astral.sh/uv/install.sh | sh"
fi

if command -v pnpm >/dev/null 2>&1; then
  ok "pnpm $(pnpm --version 2>/dev/null)"
else
  bad "pnpm not found" "npm i -g pnpm@9.14.0  (or: corepack enable)"
fi

if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    ok "docker (daemon running)"
  else
    bad "docker installed but daemon not running" "start Docker Desktop / colima"
  fi
else
  bad "docker not found" "install Docker Desktop or colima"
fi

# --- 2. dependencies installed --------------------------------------------
section "Dependencies"
if [[ -d .venv ]]; then
  ok "backend venv present (.venv)"
else
  bad "backend deps not installed" "uv sync"
fi

if [[ -d frontend/node_modules && -d frontend/apps/app/node_modules ]]; then
  ok "frontend deps present"
elif [[ -d frontend/node_modules ]]; then
  warn "frontend root deps present but app deps may be missing" "cd frontend && pnpm install"
else
  bad "frontend deps not installed" "cd frontend && pnpm install"
fi

# --- 3. configuration ------------------------------------------------------
section "Configuration"
if [[ -f .env ]]; then
  ok ".env present"
  # LLM provider sanity: non-mock providers need a key. We only test whether
  # the value is empty or still the placeholder — never print the key itself.
  provider="$(grep -E '^TELEPACE_LLM_PROVIDER=' .env | tail -1 | cut -d= -f2- | tr -d '[:space:]')"
  provider="${provider:-mock}"
  case "$provider" in
    openrouter)
      key="$(grep -E '^TELEPACE_OPENROUTER_API_KEY=' .env | tail -1 | cut -d= -f2-)"
      if [[ -z "$key" || "$key" == *REPLACE_ME* ]]; then
        bad "LLM_PROVIDER=openrouter but OPENROUTER_API_KEY is unset/placeholder" "set a real TELEPACE_OPENROUTER_API_KEY in .env, or use TELEPACE_LLM_PROVIDER=mock"
      else
        ok "LLM provider=openrouter with key set"
      fi
      ;;
    anthropic)
      key="$(grep -E '^TELEPACE_ANTHROPIC_API_KEY=' .env | tail -1 | cut -d= -f2-)"
      if [[ -z "$key" || "$key" == *REPLACE_ME* ]]; then
        bad "LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is unset/placeholder" "set TELEPACE_ANTHROPIC_API_KEY in .env, or use mock"
      else
        ok "LLM provider=anthropic with key set"
      fi
      ;;
    mock) ok "LLM provider=mock (no external calls)" ;;
    *)    warn "LLM provider='$provider' unrecognized" ;;
  esac
else
  warn "no .env — backend falls back to config defaults (localhost 15432/16379, provider=mock)" "cp .env.example .env"
fi

# --- 4. docker dev services ------------------------------------------------
section "Dev services (postgres + redis)"
COMPOSE="deploy/docker-compose.dev.yml"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  running="$(docker compose -f "$COMPOSE" ps --status running --services 2>/dev/null || true)"
  for svc in postgres redis; do
    if grep -qx "$svc" <<<"$running"; then
      cid="$(docker compose -f "$COMPOSE" ps -q "$svc" 2>/dev/null)"
      health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo unknown)"
      if [[ "$health" == "healthy" || "$health" == "none" ]]; then
        ok "$svc running ($health)"
      else
        warn "$svc running but not healthy yet ($health)" "wait a few seconds and re-run"
      fi
    else
      bad "$svc not running" "docker compose -f $COMPOSE up -d postgres redis"
    fi
  done
else
  warn "skipping service check (docker unavailable)"
fi

# --- 5. ports --------------------------------------------------------------
section "Ports"
# App ports MUST be free (dev.sh refuses otherwise); service ports SHOULD be
# bound by docker.
for port in 8010 3300; do
  if port_busy "$port"; then
    holder="$(lsof -iTCP:"$port" -sTCP:LISTEN -Pn 2>/dev/null | awk 'NR==2{print $1" (pid "$2")"}')"
    bad "app port $port already in use by $holder" "kill the process or free port $port"
  else
    ok "app port $port free"
  fi
done
for port in 15432 16379; do
  if port_busy "$port"; then
    ok "service port $port bound (docker)"
  else
    warn "service port $port not bound — postgres/redis likely down" "docker compose -f $COMPOSE up -d postgres redis"
  fi
done

# --- verdict ---------------------------------------------------------------
printf '\n'
if [[ $FAIL -gt 0 ]]; then
  printf '%s✗ %d critical issue(s), %d warning(s)%s — fix the ✗ items above (re-run with --fix for commands).\n' "$R" "$FAIL" "$WARN" "$NC"
  exit 1
else
  if [[ $WARN -gt 0 ]]; then
    printf '%s✓ ready%s (%d warning(s)) — start with: %sscripts/dev.sh%s\n' "$G" "$NC" "$WARN" "$B" "$NC"
  else
    printf '%s✓ all checks passed%s — start with: %sscripts/dev.sh%s\n' "$G" "$NC" "$B" "$NC"
  fi
  exit 0
fi
