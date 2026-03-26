#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${1:-${QOA_STAGING_ENV_FILE:-/srv/qoa/env/staging.env}}"

if [[ ! -f "$ENV_FILE" ]]; then
  printf 'Missing env file: %s\n' "$ENV_FILE" >&2
  exit 1
fi

eval "$(python3 "$ROOT_DIR/scripts/staging/load-env.py" "$ENV_FILE")"

envsubst < "$ROOT_DIR/deploy/staging/Caddyfile.template"
