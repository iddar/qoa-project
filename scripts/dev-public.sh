#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

detect_lan_ip() {
  if [[ -n "${PUBLIC_HOST:-}" ]]; then
    printf '%s\n' "$PUBLIC_HOST"
    return 0
  fi

  if command -v ipconfig >/dev/null 2>&1; then
    local candidate
    candidate="$(ipconfig getifaddr en0 2>/dev/null || true)"
    if [[ -n "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi

    candidate="$(ipconfig getifaddr en1 2>/dev/null || true)"
    if [[ -n "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  fi

  printf '%s\n' "192.168.1.203"
}

PUBLIC_HOST_VALUE="$(detect_lan_ip)"

printf 'Starting development environment for LAN access on http://%s\n' "$PUBLIC_HOST_VALUE"
printf 'API: http://%s:3000\n' "$PUBLIC_HOST_VALUE"
printf 'Backoffice: http://%s:3001\n' "$PUBLIC_HOST_VALUE"
printf 'CPG Portal: http://%s:3002\n' "$PUBLIC_HOST_VALUE"
printf 'Store Dashboard: http://%s:3003\n' "$PUBLIC_HOST_VALUE"
printf 'Digital Wallet: http://%s:3004\n' "$PUBLIC_HOST_VALUE"

export CHOUGH_URL="http://127.0.0.1:8080"
export HOST="0.0.0.0"
export PUBLIC_HOST="$PUBLIC_HOST_VALUE"
export NEXT_PUBLIC_API_URL="http://${PUBLIC_HOST_VALUE}:3000"
export NEXT_PUBLIC_CPG_PORTAL_URL="http://${PUBLIC_HOST_VALUE}:3002"
export NEXT_PUBLIC_STORE_DASHBOARD_URL="http://${PUBLIC_HOST_VALUE}:3003"
export NEXT_PUBLIC_WALLET_URL="http://${PUBLIC_HOST_VALUE}:3004"

bash "$ROOT_DIR/scripts/dev.sh" up
