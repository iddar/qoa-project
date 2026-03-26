#!/usr/bin/env bash

set -euo pipefail

ENV_FILE="${QOA_STAGING_ENV_FILE:-/srv/qoa/env/staging.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  printf 'Missing env file: %s\n' "$ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

check_url() {
  local url="$1"
  local code
  code="$(curl -k -s -o /dev/null -w '%{http_code}' "$url")"
  if [[ "$code" != "200" && "$code" != "301" && "$code" != "302" && "$code" != "307" && "$code" != "308" ]]; then
    printf '[smoke-test] FAIL %s -> %s\n' "$url" "$code" >&2
    return 1
  fi
  printf '[smoke-test] OK   %s -> %s\n' "$url" "$code"
}

check_url "${API_PUBLIC_URL%/}/v1/health"
check_url "${NEXT_PUBLIC_CPG_PORTAL_URL}"
check_url "${NEXT_PUBLIC_STORE_DASHBOARD_URL}"
check_url "${NEXT_PUBLIC_WALLET_URL}"

if [[ -n "${BACKOFFICE_URL:-}" ]]; then
  check_url "$BACKOFFICE_URL"
else
  check_url "https://${BACKOFFICE_DOMAIN}"
fi
