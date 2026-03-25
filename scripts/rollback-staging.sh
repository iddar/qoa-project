#!/usr/bin/env bash
# ==============================================================================
# QOA Staging Rollback Script
# Usage: ./rollback-staging.sh [--from-deploy DEPLOY_ID] [--steps N]
#
# Rollback to a previous deployment or a specific deployment ID.
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="/home/dbug/qoa-deploy"
DEPLOYMENTS_DIR="$DEPLOY_ROOT/deployments"
CURRENT_LINK="$DEPLOYMENTS_DIR/current"
PREVIOUS_LINK="$DEPLOYMENTS_DIR/previous"
SERVER_USER="dbug"
SERVER_HOST="dbug-drop"
SSH_KEY="$HOME/.ssh/id_ed25519_vpn"

# Defaults
TARGET_DEPLOY_ID=""
STEPS=1

while [[ $# -gt 0 ]]; do
  case $1 in
    --from-deploy) TARGET_DEPLOY_ID="$2"; shift 2 ;;
    --steps) STEPS="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

ssh_run() {
  ssh -T -i "$SSH_KEY" "$SERVER_USER@$SERVER_HOST" "$1"
}

# Resolve target: specific deploy ID, or go back N steps
if [[ -n "$TARGET_DEPLOY_ID" ]]; then
  TARGET_DIR="$DEPLOYMENTS_DIR/$TARGET_DEPLOY_ID"
  log "Rolling back to specific deployment: $TARGET_DEPLOY_ID"
else
  # Walk back STEPS from current
  CURRENT_TARGET="$CURRENT_LINK"
  for i in $(seq 1 $STEPS); do
    PREV=$(ssh_run "readlink $CURRENT_LINK")
    if [[ -z "$PREV" ]] || [[ ! -e "$PREV" ]]; then
      echo "ERROR: Cannot rollback $i step(s) - no previous deployment found"
      exit 1
    fi
    CURRENT_TARGET="$PREV"
  done
  TARGET_DIR="$CURRENT_TARGET"
  TARGET_DEPLOY_ID=$(basename "$TARGET_DIR")
  log "Rolling back $STEPS step(s) to: $TARGET_DEPLOY_ID"
fi

# Verify target exists
if ! ssh_run "[ -d '$TARGET_DIR' ] && echo 'exists'"; then
  echo "ERROR: Deployment $TARGET_DEPLOY_ID not found at $TARGET_DIR"
  exit 1
fi

# Get current for record
CURRENT_BEFORE=$(ssh_run "basename \$(readlink '$CURRENT_LINK')" 2>/dev/null || echo "unknown")

log "Current: $CURRENT_BEFORE → Target: $TARGET_DEPLOY_ID"

# Save rollback info
ROLLBACK_ID="rollback_$(date +%Y%m%d_%H%M%S)"
ssh_run "mkdir -p $DEPLOYMENTS_DIR/$ROLLBACK_ID"

# Perform rollback
ssh_run "
  echo 'Switching symlink from $(basename \$(readlink $CURRENT_LINK)) to $TARGET_DEPLOY_ID...'
  rm -f '$CURRENT_LINK'
  ln -sfn '$TARGET_DIR' '$CURRENT_LINK'
  echo 'Symlink updated'
"

# Restart services with the rolled-back version
ssh_run "
  # Stop current services
  pkill -f 'bun --env-file=.env.staging' 2>/dev/null || true
  pkill -f 'bun index.ts' 2>/dev/null || true
  pkill -f 'node.*next start' 2>/dev/null || true
  sleep 3

  DEPLOY_DIR=\$(readlink '$CURRENT_LINK')
  echo 'Deploy dir: \$DEPLOY_DIR'

  # Start API
  cd \$DEPLOY_DIR/src
  nohup /home/dbug/.bun/bin/bun --env-file=.env.staging start > /opt/qoa-deploy/logs/api-$ROLLBACK_ID.log 2>&1 &
  echo 'API restarted'

  sleep 5

  # Start frontends
  for app in backoffice cpg-portal store-dashboard digital-wallet; do
    PORT=\$(case \$app in backoffice) echo 3001;; cpg-portal) echo 3002;; store-dashboard) echo 3003;; digital-wallet) echo 3004;; esac)
    nohup node \$DEPLOY_DIR/apps/\$app/node_modules/.bin/next start -p \$PORT -H 0.0.0.0 > /opt/qoa-deploy/logs/\$app-$ROLLBACK_ID.log 2>&1 &
    echo \"\$app started on port \$PORT\"
  done

  # Verify API health
  sleep 5
  if curl -sf http://localhost:3000/v1/health > /dev/null 2>&1; then
    echo 'API health OK'
  else
    echo 'WARNING: API may not be healthy'
  fi

  echo 'Rollback complete'
"

# Record rollback
ssh_run "cat > $DEPLOYMENTS_DIR/$ROLLBACK_ID/rollback.json << EOF
{
  \"rollbackId\": \"$ROLLBACK_ID\",
  \"from\": \"$CURRENT_BEFORE\",
  \"to\": \"$TARGET_DEPLOY_ID\",
  \"rollbackAt\": \"$(date -Iseconds)\",
  \"reason\": \"manual\"
}
EOF"

log "=== Rollback Complete ==="
log "Now running: $(basename $(ssh_run 'readlink $CURRENT_LINK'))"
log "Previous: was $CURRENT_BEFORE"
