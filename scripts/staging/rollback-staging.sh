#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="${QOA_STAGING_ROOT:-/srv/qoa}"
STATE_DIR="$ROOT_DIR/releases"
TARGET_REF="${1:-}"

if [[ -z "$TARGET_REF" ]]; then
  if [[ ! -f "$STATE_DIR/previous.sha" ]]; then
    printf 'No previous release recorded at %s/previous.sha\n' "$STATE_DIR" >&2
    exit 1
  fi
  TARGET_REF="$(tr -d '\n' < "$STATE_DIR/previous.sha")"
fi

exec "$ROOT_DIR/repo/scripts/staging/deploy-staging.sh" "$TARGET_REF"
