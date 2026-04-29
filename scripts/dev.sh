#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${QOA_ENV_FILE:-src/.env.development}"

if [[ "$ENV_FILE" != /* ]]; then
  ENV_FILE="$ROOT_DIR/$ENV_FILE"
fi

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
  docker compose --env-file "$ENV_FILE" "$@"
}

require_free_port() {
  local port="$1"
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    printf 'Port %s is already in use. Stop the blocking process before running dev.sh.\n' "$port" >&2
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >&2
    exit 1
  fi
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
    require_free_port 3000
    require_free_port 3001
    require_free_port 3002
    require_free_port 3003
    require_free_port 3004
    compose up -d --remove-orphans postgres postgres_test
    wait_for_service postgres
    wait_for_service postgres_test
    bun --env-file="$ENV_FILE" run --cwd "$ROOT_DIR/src" db:rebuild
    bun --env-file="$ENV_FILE" run --cwd "$ROOT_DIR/src" db:seed:development
    export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:3000}"
    export NEXT_PUBLIC_CPG_PORTAL_URL="${NEXT_PUBLIC_CPG_PORTAL_URL:-http://localhost:3002}"
    export NEXT_PUBLIC_STORE_DASHBOARD_URL="${NEXT_PUBLIC_STORE_DASHBOARD_URL:-http://localhost:3003}"
    export NEXT_PUBLIC_WALLET_URL="${NEXT_PUBLIC_WALLET_URL:-http://localhost:3004}"
    export QOA_API_PROXY_TARGET="${QOA_API_PROXY_TARGET:-http://localhost:3000}"
    bun --env-file="$ENV_FILE" run --parallel --workspaces --if-present dev
    ;;
  down)
    compose stop postgres postgres_test
    ;;
  rebuild)
    compose up -d --remove-orphans postgres postgres_test
    wait_for_service postgres
    wait_for_service postgres_test
    bun --env-file="$ENV_FILE" run --cwd "$ROOT_DIR/src" db:rebuild
    bun --env-file="$ENV_FILE" run --cwd "$ROOT_DIR/src" db:seed:development
    ;;
  logs)
    compose logs -f postgres postgres_test
    ;;
  *)
    usage
    exit 1
    ;;
esac
