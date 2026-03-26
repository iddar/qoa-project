#!/usr/bin/env bash

set -euo pipefail

REMOVE_POSTGRES=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remove-postgres)
      REMOVE_POSTGRES=true
      shift
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      exit 1
      ;;
  esac
done

as_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

log() {
  printf '[remove-legacy] %s\n' "$*"
}

log 'Stopping and disabling legacy QOA services'
for unit in qoa-api qoa-backoffice qoa-cpg qoa-store qoa-wallet; do
  as_root systemctl stop "$unit" 2>/dev/null || true
  as_root systemctl disable "$unit" 2>/dev/null || true
done

log 'Removing legacy QOA systemd unit files'
for unit in qoa-api qoa-backoffice qoa-cpg qoa-store qoa-wallet; do
  as_root rm -f "/etc/systemd/system/${unit}.service"
done
as_root systemctl daemon-reload

if [[ -f /etc/caddy/Caddyfile ]]; then
  log 'Removing old qoa-* domains from Caddyfile'
  tmp_file="$(mktemp)"
  python3 - <<'PY' /etc/caddy/Caddyfile "$tmp_file"
from pathlib import Path
import re
import sys

source = Path(sys.argv[1]).read_text()
targets = [
    "qoa-api.dbug.mx",
    "qoa-admin.dbug.mx",
    "qoa-cpg.dbug.mx",
    "qoa-store.dbug.mx",
    "qoa.dbug.mx",
]

for host in targets:
    pattern = re.compile(rf"^\s*{re.escape(host)}\s*\{{.*?^\}}\s*\n?", re.MULTILINE | re.DOTALL)
    source = re.sub(pattern, "", source)

Path(sys.argv[2]).write_text(source.rstrip() + "\n")
PY
  as_root cp "$tmp_file" /etc/caddy/Caddyfile
  rm -f "$tmp_file"
  as_root systemctl reload caddy
fi

log 'Removing legacy directories'
as_root rm -rf /opt/qoa
rm -rf /home/dbug/qoa-deploy

if [[ "$REMOVE_POSTGRES" == true ]]; then
  log 'Removing native PostgreSQL packages and data'
  as_root systemctl stop postgresql 2>/dev/null || true
  as_root systemctl disable postgresql 2>/dev/null || true
  as_root apt-get purge -y 'postgresql*'
  as_root apt-get autoremove -y
  as_root rm -rf /var/lib/postgresql /etc/postgresql /var/log/postgresql
fi

log 'Legacy QOA cleanup completed'
