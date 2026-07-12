#!/usr/bin/env bash
# telepace down — stop the dev stack.
#
#   scripts/down.sh          # stop docker services (postgres+redis); keep data
#   scripts/down.sh --reset  # stop AND delete the postgres volume (wipes DB)
#
# Foreground backend/frontend started by dev.sh/up.sh are stopped with Ctrl+C
# in their own terminal — this script only manages the docker services.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE="deploy/docker-compose.dev.yml"

if [[ "${1:-}" == "--reset" ]]; then
  echo "[down] stopping services AND deleting the postgres volume (all DB data will be lost)…"
  docker compose -f "$COMPOSE" down -v
  echo "[down] done. Schema auto-recreates on next backend start (CREATE TABLE IF NOT EXISTS)."
else
  echo "[down] stopping postgres + redis (data preserved in the pg_data volume)…"
  docker compose -f "$COMPOSE" stop postgres redis
  echo "[down] done. Restart with: scripts/up.sh"
fi
