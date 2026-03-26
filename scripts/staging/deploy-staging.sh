#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="${QOA_STAGING_ROOT:-/srv/qoa}"
REPO_DIR="$ROOT_DIR/repo"
ENV_FILE="${QOA_STAGING_ENV_FILE:-$ROOT_DIR/env/staging.env}"
STATE_DIR="$ROOT_DIR/releases"
COMPOSE_FILE="$REPO_DIR/docker-compose.staging.yml"
TARGET_REF="${1:-origin/main}"

if [[ ! -d "$REPO_DIR/.git" ]]; then
  printf 'Missing repo at %s\n' "$REPO_DIR" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  printf 'Missing env file at %s\n' "$ENV_FILE" >&2
  exit 1
fi

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

log() {
  printf '[deploy-staging] %s\n' "$*"
}

mkdir -p "$STATE_DIR"

current_sha="$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || true)"
log 'Fetching git refs'
git -C "$REPO_DIR" fetch --all --tags --prune
git -C "$REPO_DIR" reset --hard
git -C "$REPO_DIR" clean -fd
git -C "$REPO_DIR" checkout --force "$TARGET_REF"
new_sha="$(git -C "$REPO_DIR" rev-parse HEAD)"

if [[ -n "$current_sha" ]]; then
  printf '%s\n' "$current_sha" > "$STATE_DIR/previous.sha"
fi
printf '%s\n' "$new_sha" > "$STATE_DIR/current.sha"
printf '%s %s\n' "$(date -Iseconds)" "$new_sha" >> "$STATE_DIR/history.log"

export QOA_SERVICE_ENV_FILE="$ENV_FILE"

log 'Starting PostgreSQL container'
compose up -d postgres

log 'Starting API container'
compose up -d --build api

log 'Rebuilding staging database from migrations and seeds'
compose run --rm api bun run db:rebuild:staging

log 'Building and starting all QOA services'
compose up -d --build api backoffice cpg-portal store-dashboard digital-wallet

log 'Running smoke tests'
QOA_STAGING_ENV_FILE="$ENV_FILE" "$REPO_DIR/scripts/staging/smoke-test.sh"

log "Deployment complete: $new_sha"
