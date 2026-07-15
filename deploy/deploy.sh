#!/usr/bin/env bash
set -euo pipefail
docker compose --env-file .env -f deploy/compose.prod.yml --project-name telepace up -d --build --remove-orphans
docker image prune -f
