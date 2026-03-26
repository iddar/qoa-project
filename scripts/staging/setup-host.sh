#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="${QOA_STAGING_ROOT:-/srv/qoa}"
REPO_DIR="$ROOT_DIR/repo"
ENV_DIR="$ROOT_DIR/env"
DATA_DIR="$ROOT_DIR/data"
LOG_DIR="$ROOT_DIR/logs"
RELEASE_DIR="$ROOT_DIR/releases"
REPO_SSH_URL="${REPO_SSH_URL:-${1:-}}"

if [[ -z "$REPO_SSH_URL" ]]; then
  printf 'Usage: REPO_SSH_URL=git@github.com:org/repo.git %s\n' "$0" >&2
  exit 1
fi

as_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

log() {
  printf '[setup-host] %s\n' "$*"
}

TARGET_USER="${SUDO_USER:-$USER}"

log 'Installing git and Docker prerequisites'
as_root apt-get update
as_root apt-get install -y ca-certificates curl git gnupg lsb-release gettext-base

if ! command -v docker >/dev/null 2>&1; then
  log 'Installing Docker Engine'
  as_root install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | as_root gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  as_root chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | as_root tee /etc/apt/sources.list.d/docker.list >/dev/null
  as_root apt-get update
  as_root apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

as_root usermod -aG docker "$TARGET_USER"
as_root mkdir -p "$ROOT_DIR" "$ENV_DIR" "$DATA_DIR" "$LOG_DIR" "$RELEASE_DIR"
as_root chown -R "$TARGET_USER":"$TARGET_USER" "$ROOT_DIR"

if [[ ! -d "$REPO_DIR/.git" ]]; then
  log 'Cloning repository'
  git clone "$REPO_SSH_URL" "$REPO_DIR"
else
  log 'Repository already exists, fetching latest refs'
  git -C "$REPO_DIR" fetch --all --tags --prune
fi

if [[ ! -f "$ENV_DIR/staging.env" ]]; then
  log 'Creating staging env from example'
  cp "$REPO_DIR/deploy/staging/staging.env.example" "$ENV_DIR/staging.env"
fi

log 'Rendering example Caddy config'
QOA_STAGING_ENV_FILE="$ENV_DIR/staging.env" "$REPO_DIR/scripts/staging/render-caddy.sh" > "$ENV_DIR/qoa-staging.Caddyfile"

log 'Setup complete'
printf '\nNext steps:\n'
printf '1. Edit %s/staging.env\n' "$ENV_DIR"
printf '2. Merge %s/qoa-staging.Caddyfile into /etc/caddy/Caddyfile and reload Caddy\n' "$ENV_DIR"
printf '3. Re-login so docker group applies, then run %s/scripts/staging/deploy-staging.sh\n' "$REPO_DIR"
