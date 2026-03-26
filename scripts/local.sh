#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: scripts/local.sh [up|down|rebuild|logs]

up       Build and start full local Docker stack
down     Stop local Docker stack
rebuild  Rebuild and reseed local database inside app container
logs     Show Docker logs for local stack
EOF
}

command="${1:-up}"

compose() {
  docker compose --env-file src/.env.local "$@"
}

case "$command" in
  up)
    compose up --build --remove-orphans
    ;;
  down)
    compose down
    ;;
  rebuild)
    compose up -d --remove-orphans postgres
    compose run --build --rm app bun run db:rebuild:local
    ;;
  logs)
    compose logs -f app postgres
    ;;
  *)
    usage
    exit 1
    ;;
esac
