#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="src/.env.development.ngrok-store"
COMMAND="${1:-up}"

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing required env var: %s\n' "$name" >&2
    exit 1
  fi
}

url_host() {
  local value="$1"
  value="${value#*://}"
  value="${value%%/*}"
  value="${value%%:*}"
  printf '%s\n' "$value"
}

require_env NGROK_STORE_URL

STORE_HOST="$(url_host "$NGROK_STORE_URL")"
API_URL_VALUE="${NGROK_API_URL:-$NGROK_STORE_URL}"
API_HOST="$(url_host "$API_URL_VALUE")"
PUBLIC_HOST_VALUE="${PUBLIC_HOST:-$STORE_HOST}"
ALLOWED_ORIGINS_VALUE="${ALLOWED_DEV_ORIGINS:-$STORE_HOST,$API_HOST}"

export QOA_ENV_FILE="$ENV_FILE"
export HOST="0.0.0.0"
export PUBLIC_HOST="$PUBLIC_HOST_VALUE"
export ALLOWED_DEV_ORIGINS="$ALLOWED_ORIGINS_VALUE"
export NEXT_PUBLIC_API_URL="$NGROK_STORE_URL"
export NEXT_PUBLIC_STORE_DASHBOARD_URL="$NGROK_STORE_URL"
export NEXT_PUBLIC_CPG_PORTAL_URL="${NGROK_CPG_URL:-http://127.0.0.1:3002}"
export NEXT_PUBLIC_WALLET_URL="${NGROK_WALLET_URL:-http://127.0.0.1:3004}"
export CHOUGH_URL="${NGROK_CHOUGH_URL:-http://127.0.0.1:8080}"

if [[ "$API_URL_VALUE" == "$NGROK_STORE_URL" ]]; then
  export QOA_API_PROXY_TARGET="http://127.0.0.1:3000"
else
  export QOA_API_PROXY_TARGET=""
  export NEXT_PUBLIC_API_URL="$API_URL_VALUE"
fi

printf 'Starting Store Dashboard via ngrok\n'
printf 'Store URL: %s\n' "$NGROK_STORE_URL"
printf 'API URL: %s\n' "$API_URL_VALUE"
if [[ -n "${QOA_API_PROXY_TARGET:-}" ]]; then
  printf 'API proxy target: %s\n' "$QOA_API_PROXY_TARGET"
fi
printf 'Allowed dev origins: %s\n' "$ALLOWED_ORIGINS_VALUE"

bash "$ROOT_DIR/scripts/dev.sh" "$COMMAND"
