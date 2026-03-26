#!/usr/bin/env bash

set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups}"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-$BACKUP_ROOT/qoa-legacy-$STAMP}"
TARGET_USER="${SUDO_USER:-$USER}"

as_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

log() {
  printf '[backup-legacy] %s\n' "$*"
}

as_root mkdir -p "$BACKUP_DIR"
as_root chown -R "$TARGET_USER":"$TARGET_USER" "$BACKUP_DIR"
log "Backing up legacy QOA files into $BACKUP_DIR"

if [[ -f /etc/caddy/Caddyfile ]]; then
  as_root cp /etc/caddy/Caddyfile "$BACKUP_DIR/Caddyfile"
fi

mkdir -p "$BACKUP_DIR/systemd"
for unit in qoa-api qoa-backoffice qoa-cpg qoa-store qoa-wallet; do
  if as_root test -f "/etc/systemd/system/${unit}.service"; then
    as_root cp "/etc/systemd/system/${unit}.service" "$BACKUP_DIR/systemd/${unit}.service"
  fi
done

if [[ -d /opt/qoa ]]; then
  as_root tar -C /opt -czf "$BACKUP_DIR/opt-qoa.tgz" qoa
fi

if [[ -d /home/dbug/qoa-deploy ]]; then
  tar -C /home/dbug -czf "$BACKUP_DIR/home-dbug-qoa-deploy.tgz" qoa-deploy
fi

if [[ -f /opt/qoa/src/.env.staging ]]; then
  sed -n 's/^\([A-Z0-9_]*\)=.*/\1/p' /opt/qoa/src/.env.staging > "$BACKUP_DIR/env-staging.keys"
fi

systemctl status qoa-api qoa-backoffice qoa-cpg qoa-store qoa-wallet --no-pager > "$BACKUP_DIR/qoa-services.status" 2>&1 || true
ps -eo pid,ppid,user,cmd --sort=pid > "$BACKUP_DIR/processes.txt"

log "Done. Review backup at $BACKUP_DIR"
