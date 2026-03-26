#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: scripts/test.sh [up|down|run|rebuild|logs]

up       Start Docker deps for tests
down     Stop test Docker deps
run      Rebuild test DB and run backend tests
rebuild  Rebuild and reseed test database only
logs     Show Docker logs for test deps
EOF
}

command="${1:-run}"

compose() {
  docker compose --env-file src/.env.development "$@"
}

case "$command" in
  up)
    compose up -d --remove-orphans postgres_test
    ;;
  down)
    compose stop postgres_test
    ;;
  run)
    compose up -d --remove-orphans postgres_test
    bun run --cwd "$ROOT_DIR/src" test
    ;;
  rebuild)
    compose up -d --remove-orphans postgres_test
    bun run --cwd "$ROOT_DIR/src" db:rebuild:test
    ;;
  logs)
    compose logs -f postgres_test
    ;;
  *)
    usage
    exit 1
    ;;
esac
