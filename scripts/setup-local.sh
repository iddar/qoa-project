#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command="${1:-bootstrap}"

log() {
  printf '[setup-local] %s\n' "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

doctor() {
  require_cmd bun
  require_cmd docker

  log "bun $(bun --version)"
  log "docker $(docker --version)"
  log "compose $(docker compose version --short)"

  docker compose --env-file "$ROOT_DIR/src/.env.development" config >/dev/null
  log 'Compose config OK for development'
}

bootstrap() {
  doctor

  log 'Installing workspace dependencies with Bun'
  bun install --cwd "$ROOT_DIR"

  log 'Preparing development database'
  bun run --cwd "$ROOT_DIR" dev:rebuild

  cat <<'EOF'

Local environment is ready.

Daily commands:
- bun run dev:env      Start API/apps on host with Docker Postgres
- bun run dev:down     Stop development databases
- bun run test:env     Rebuild test DB and run backend tests
EOF
}

case "$command" in
  bootstrap)
    bootstrap
    ;;
  doctor)
    doctor
    ;;
  *)
    printf 'Usage: scripts/setup-local.sh [bootstrap|doctor]\n' >&2
    exit 1
    ;;
esac
