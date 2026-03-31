#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

API_URL="${QOA_API_URL:-https://api.qoa.test}"
BACKOFFICE_URL="${QOA_BACKOFFICE_URL:-https://admin.qoa.test}"
CPG_URL="${QOA_CPG_URL:-https://cpg.qoa.test}"
STORE_URL="${QOA_STORE_URL:-https://store.qoa.test}"
WALLET_URL="${QOA_WALLET_URL:-https://wallet.qoa.test}"
CHOUGH_URL_VALUE="${QOA_CHOUGH_URL:-https://voice.qoa.test}"
ALLOWED_ORIGINS_VALUE="${ALLOWED_DEV_ORIGINS:-admin.qoa.test,api.qoa.test,cpg.qoa.test,store.qoa.test,wallet.qoa.test,voice.qoa.test}"

printf 'Starting development environment for Caddy HTTPS\n'
printf 'API: %s\n' "$API_URL"
printf 'Backoffice: %s\n' "$BACKOFFICE_URL"
printf 'CPG Portal: %s\n' "$CPG_URL"
printf 'Store Dashboard: %s\n' "$STORE_URL"
printf 'Digital Wallet: %s\n' "$WALLET_URL"
printf 'Voice: %s\n' "$CHOUGH_URL_VALUE"

export CHOUGH_URL="$CHOUGH_URL_VALUE"
export HOST="0.0.0.0"
export PUBLIC_HOST="${API_URL#*://}"
export ALLOWED_DEV_ORIGINS="$ALLOWED_ORIGINS_VALUE"
export QOA_API_URL="$API_URL"
export QOA_BACKOFFICE_URL="$BACKOFFICE_URL"
export QOA_CPG_URL="$CPG_URL"
export QOA_STORE_URL="$STORE_URL"
export QOA_WALLET_URL="$WALLET_URL"
export QOA_CHOUGH_URL="$CHOUGH_URL_VALUE"

bash "$ROOT_DIR/scripts/write-app-local-envs.sh" caddy-https
bash "$ROOT_DIR/scripts/dev.sh" up
