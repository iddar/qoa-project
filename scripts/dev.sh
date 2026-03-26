#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: scripts/dev.sh [up|down|rebuild|logs]

up       Start Docker deps for development, rebuild dev DB, run workspaces on host
down     Stop Docker deps for development
rebuild  Rebuild and reseed development database
logs     Show Docker logs for development deps
EOF
}

command="${1:-up}"

compose() {
  docker compose --env-file src/.env.development "$@"
}

case "$command" in
  up)
    compose up -d --remove-orphans postgres postgres_test
    bun run --cwd "$ROOT_DIR/src" db:rebuild:development
    bun run --env-file=.env.development --parallel --workspaces --if-present dev
    ;;
  down)
    compose stop postgres postgres_test
    ;;
  rebuild)
    compose up -d --remove-orphans postgres postgres_test
    bun run --cwd "$ROOT_DIR/src" db:rebuild:development
    ;;
  logs)
    compose logs -f postgres postgres_test
    ;;
  *)
    usage
    exit 1
    ;;
esac
