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

wait_for_service() {
  local service="$1"
  local cid=""
  local status=""

  printf 'Waiting for %s to be ready' "$service"
  for _ in {1..60}; do
    cid="$(compose ps -q "$service")"
    if [[ -n "$cid" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
      if [[ "$status" == "healthy" || "$status" == "running" ]]; then
        printf '\n'
        return 0
      fi
    fi

    printf '.'
    sleep 2
  done

  printf '\n%s did not become ready in time.\n' "$service"
  compose ps
  exit 1
}

case "$command" in
  up)
    compose up -d --remove-orphans postgres postgres_test
    wait_for_service postgres
    wait_for_service postgres_test
    bun run --cwd "$ROOT_DIR/src" db:rebuild:development
    bun run --env-file=.env.development --parallel --workspaces --if-present dev
    ;;
  down)
    compose stop postgres postgres_test
    ;;
  rebuild)
    compose up -d --remove-orphans postgres postgres_test
    wait_for_service postgres
    wait_for_service postgres_test
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
