#!/usr/bin/env bash
# ==============================================================================
# QOA Staging Deploy Script
# Usage: ./deploy-staging.sh [--app api|all] [--skip-tests] [--migrate] [--seed] [--env staging|production]
#
# Runs migrations, seeds, builds, deploys, and optionally runs e2e tests.
# Creates deployment markers for rollback support.
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_ROOT="/home/dbug/qoa-deploy"
DEPLOYMENTS_DIR="$DEPLOY_ROOT/deployments"
CURRENT_LINK="$DEPLOYMENTS_DIR/current"
PREVIOUS_LINK="$DEPLOYMENTS_DIR/previous"
SERVER_USER="dbug"
SERVER_HOST="dbug-drop"
SSH_KEY="$HOME/.ssh/id_ed25519_vpn"

# Defaults
APP="all"
SKIP_TESTS="false"
MIGRATE="false"
SEED="false"
ENV="staging"
DEPLOY_ID=""
ROLLBACK_ON_ERROR="true"
EMAIL="iddar.olivares.servicios@gmail.com"

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --app) APP="$2"; shift 2 ;;
    --skip-tests) SKIP_TESTS="true"; shift ;;
    --migrate) MIGRATE="true"; shift ;;
    --seed) SEED="true"; shift ;;
    --env) ENV="$2"; shift 2 ;;
    --deploy-id) DEPLOY_ID="$2"; shift 2 ;;
    --no-rollback) ROLLBACK_ON_ERROR="false"; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ==============================================================================
# Helpers
# ==============================================================================

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

ssh_run() {
  ssh -T -i "$SSH_KEY" "$SERVER_USER@$SERVER_HOST" "$1"
}

ssh_run_file() {
  ssh -T -i "$SSH_KEY" "$SERVER_USER@$SERVER_HOST" "$(cat)"
}

send_file() {
  rsync -az --exclude='node_modules' --exclude='.git' --exclude='.next' \
    -e "ssh -i $SSH_KEY" "$1" "$SERVER_USER@$SERVER_HOST:$2"
}

# ==============================================================================
# Pre-deploy checks
# ==============================================================================

log "=== Staging Deploy Started ==="
log "App: $APP | Migrate: $MIGRATE | Seed: $SEED | Skip tests: $SKIP_TESTS"

# Get commit info
cd "$REPO_DIR"
COMMIT_SHA=$(git rev-parse HEAD)
COMMIT_SHORT=$(git rev-parse --short HEAD)
COMMIT_MSG=$(git log -1 --format='%s')
COMMIT_AUTHOR=$(git log -1 --format='%an')
COMMIT_DATE=$(git log -1 --format='%ci')

log "Deploying: $COMMIT_SHORT - $COMMIT_MSG"
log "Author: $COMMIT_AUTHOR at $COMMIT_DATE"

# Check for uncommitted changes (warn but don't block)
if ! git diff --quiet || ! git diff --cached --quiet; then
  log "WARNING: There are uncommitted changes (stashed or staged)"
fi

# Check if we're on main or the branch being merged
BRANCH=$(git branch --show-current 2>/dev/null || git rev-parse --abbrev-ref HEAD)
log "Current branch: $BRANCH"

# ==============================================================================
# Create deployment directory
# ==============================================================================

DEPLOY_ID="${DEPLOY_ID:-$(date +%Y%m%d_%H%M%S)_${COMMIT_SHORT}}"
DEPLOY_DIR="$DEPLOYMENTS_DIR/$DEPLOY_ID"
DEPLOY_API_DIR="$DEPLOY_DIR/src"
DEPLOY_APPS_DIR="$DEPLOY_DIR/apps"

log "Deployment ID: $DEPLOY_ID"
log "Deployment dir: $DEPLOY_DIR"

# ==============================================================================
# PHASE 1: Sync source files to server
# ==============================================================================

log "Phase 1: Syncing source files..."

# Create deployment dir on server
ssh_run "mkdir -p $DEPLOY_DIR && mkdir -p $DEPLOY_APPS_DIR"

# Rsync src (API)
rsync -az --exclude='node_modules' --exclude='.git' --exclude='.next' --exclude='logs' \
  -e "ssh -i $SSH_KEY" \
  "$REPO_DIR/src/" "$SERVER_USER@$SERVER_HOST:$DEPLOY_API_DIR/"

# Rsync apps (frontends)
rsync -az --exclude='node_modules' --exclude='.git' --exclude='.next' --exclude='.vite' \
  -e "ssh -i $SSH_KEY" \
  "$REPO_DIR/apps/" "$SERVER_USER@$SERVER_HOST:$DEPLOY_APPS_DIR/"

# Rsync root config files
rsync -az --exclude='node_modules' --exclude='.git' \
  -e "ssh -i $SSH_KEY" \
  "$REPO_DIR/package.json" "$SERVER_USER@$SERVER_HOST:$DEPLOY_DIR/"
rsync -az --exclude='.git' \
  -e "ssh -i $SSH_KEY" \
  "$REPO_DIR/packages/" "$SERVER_USER@$SERVER_HOST:$DEPLOY_DIR/"

# ==============================================================================
# PHASE 2: Create version.json
# ==============================================================================

log "Phase 2: Writing version marker..."

ssh_run "cat > $DEPLOY_DIR/version.json << EOF
{
  \"deployId\": \"$DEPLOY_ID\",
  \"commit\": \"$COMMIT_SHA\",
  \"commitShort\": \"$COMMIT_SHORT\",
  \"message\": $(echo "$COMMIT_MSG" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))"),
  \"author\": \"$COMMIT_AUTHOR\",
  \"deployedAt\": \"$COMMIT_DATE\",
  \"app\": \"$APP\",
  \"env\": \"$ENV\"
}
EOF"

# ==============================================================================
# PHASE 3: Install dependencies & build
# ==============================================================================

log "Phase 3: Installing dependencies & building..."

BUILD_START=$(date +%s)

# Install API deps & build
ssh_run "cd $DEPLOY_API_DIR && npm install --prefer-offline 2>&1 | tail -5"

# Build frontends
if [[ "$APP" == "all" ]] || [[ "$APP" == "frontends" ]]; then
  for app_dir in backoffice cpg-portal store-dashboard digital-wallet; do
    log "Building $app_dir..."
    ssh_run "cd $DEPLOY_APPS_DIR/$app_dir && npm install --prefer-offline 2>&1 | tail -3 && npm run build 2>&1 | tail -10"
  done
fi

BUILD_END=$(date +%s)
BUILD_DURATION=$((BUILD_END - BUILD_START))
log "Build completed in ${BUILD_DURATION}s"

# ==============================================================================
# PHASE 4: Switch to new deployment (atomic)
# ==============================================================================

log "Phase 4: Switching deployment (atomic)..."

# Save current as previous
ssh_run "
  if [ -L '$CURRENT_LINK' ] && [ -e '$CURRENT_LINK' ]; then
    rm -f '$PREVIOUS_LINK'
    cp -rL '$CURRENT_LINK' '$DEPLOYMENTS_DIR/_rollback_temp' 2>/dev/null || true
    ln -sfn \$(readlink '$CURRENT_LINK') '$PREVIOUS_LINK' 2>/dev/null || true
  fi
  rm -f '$CURRENT_LINK'
  ln -sfn '$DEPLOY_DIR' '$CURRENT_LINK'
  echo 'Switched to $DEPLOY_ID'
"

# ==============================================================================
# PHASE 5: Run migrations
# ==============================================================================

if [[ "$MIGRATE" == "true" ]]; then
  log "Phase 5: Running migrations..."
  # TODO: Add migration command based on your DB tool (drizzle, prisma, etc.)
  # Example for drizzle:
  ssh_run "cd $DEPLOY_API_DIR && echo 'MIGRATION_SCRIPT_PLACEHOLDER' | bash"
  log "Migrations complete"
else
  log "Phase 5: Skipping migrations (use --migrate to run)"
fi

# ==============================================================================
# PHASE 6: Seed (if requested)
# ==============================================================================

if [[ "$SEED" == "true" ]]; then
  log "Phase 6: Running seed..."
  ssh_run "cd $DEPLOY_API_DIR && echo 'SEED_SCRIPT_PLACEHOLDER' | bash"
  log "Seed complete"
else
  log "Phase 6: Skipping seed (use --seed to run)"
fi

# ==============================================================================
# PHASE 7: Restart services
# ==============================================================================

log "Phase 7: Restarting services..."

ssh_run "
  # Stop old processes (API)
  pkill -f 'bun --env-file=.env.staging' 2>/dev/null || true
  pkill -f 'bun index.ts' 2>/dev/null || true
  sleep 2

  # Stop frontends
  pkill -f 'node.*next start' 2>/dev/null || true
  sleep 2

  # Start API
  cd $DEPLOY_DIR/src
  nohup /home/dbug/.bun/bin/bun --env-file=.env.staging start > /opt/qoa-deploy/logs/api-$DEPLOY_ID.log 2>&1 &
  API_PID=\$!
  echo \"API started: \$API_PID\"

  # Wait for API health
  sleep 5
  for i in 1 2 3 4 5; do
    if curl -sf http://localhost:3000/v1/health > /dev/null 2>&1; then
      echo 'API health OK'
      break
    fi
    sleep 3
  done

  # Start frontends
  for app in backoffice cpg-portal store-dashboard digital-wallet; do
    PORT=\$(case \$app in backoffice) echo 3001;; cpg-portal) echo 3002;; store-dashboard) echo 3003;; digital-wallet) echo 3004;; esac)
    nohup node /opt/qoa-deploy/deployments/\$(basename \$(readlink $CURRENT_LINK))/apps/\$app/node_modules/.bin/next start -p \$PORT -H 0.0.0.0 > /opt/qoa-deploy/logs/\$app-$DEPLOY_ID.log 2>&1 &
    echo \"\$app started on port \$PORT\"
  done

  echo 'All services restarted'
"

# ==============================================================================
# PHASE 8: Run e2e tests
# ==============================================================================

if [[ "$SKIP_TESTS" == "false" ]]; then
  log "Phase 8: Running e2e tests..."
  
  TEST_START=$(date +%s)
  
  # Run e2e tests locally (they use the deployed staging)
  cd "$REPO_DIR"
  
  E2E_RESULT="passed"
  if npm run e2e -- --reporter=list 2>&1 | tee /tmp/e2e-result-$DEPLOY_ID.log; then
    log "E2E tests PASSED"
  else
    E2E_RESULT="failed"
    log "E2E tests FAILED"
  fi
  
  TEST_END=$(date +%s)
  TEST_DURATION=$((TEST_END - TEST_START))
  
  # Send test results notification
  if [[ "$E2E_RESULT" == "failed" ]]; then
    log "E2E tests failed - consider reviewing /tmp/e2e-result-$DEPLOY_ID.log"
    # Don't rollback automatically on test failure unless configured
    if [[ "$ROLLBACK_ON_ERROR" == "true" ]]; then
      log "ROLLING BACK due to test failure..."
      "$SCRIPT_DIR/rollback-staging.sh" --from-deploy "$DEPLOY_ID"
    fi
  fi
else
  log "Phase 8: Skipping tests (--skip-tests)"
fi

# ==============================================================================
# PHASE 9: Finalize deployment record
# ==============================================================================

DEPLOY_END=$(date +%s)
DEPLOY_DURATION=$((DEPLOY_END - BUILD_START))

log "Phase 9: Recording deployment..."

ssh_run "cat > $DEPLOY_DIR/deployment.json << EOF
{
  \"deployId\": \"$DEPLOY_ID\",
  \"commit\": \"$COMMIT_SHA\",
  \"commitShort\": \"$COMMIT_SHORT\",
  \"message\": $(echo "$COMMIT_MSG" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))"),
  \"author\": \"$COMMIT_AUTHOR\",
  \"deployedAt\": \"$COMMIT_DATE\",
  \"completedAt\": \"$(date -Iseconds)\",
  \"duration\": $DEPLOY_DURATION,
  \"buildDuration\": $BUILD_DURATION,
  \"app\": \"$APP\",
  \"env\": \"$ENV\",
  \"status\": \"success\"
}
EOF"

log "=== Deploy Complete: $DEPLOY_ID ==="
log "Duration: ${DEPLOY_DURATION}s"
log "URLs: https://qoa.dbug.mx | https://qoa-cpg.dbug.mx | https://qoa-store.dbug.mx | https://qoa-admin.dbug.mx"
log "Commit: $COMMIT_SHORT - $COMMIT_MSG"
