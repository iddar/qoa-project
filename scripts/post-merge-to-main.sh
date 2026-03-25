#!/usr/bin/env bash
# ==============================================================================
# Git post-merge hook - triggers deploy to staging when merging to main
# Install: cp scripts/post-merge-to-main.sh .git/hooks/post-merge && chmod +x
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Only run on main branch
if [[ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]]; then
  echo "[deploy-hook] Not on main branch, skipping deploy"
  exit 0
fi

COMMIT_SHORT=$(git rev-parse --short HEAD)
COMMIT_MSG=$(git log -1 --format='%s')
LOG_FILE="/tmp/deploy-staging-${COMMIT_SHORT}.log"

echo "[deploy-hook] Merge to main detected: $COMMIT_SHORT - $COMMIT_MSG"
echo "[deploy-hook] Running deploy-staging.sh..."

# Run deploy directly (no pi needed)
cd "$REPO_DIR"
bash "$SCRIPT_DIR/deploy-staging.sh" --app all --migrate --env staging \
  > "$LOG_FILE" 2>&1

EXIT_CODE=$?

if [[ $EXIT_CODE -eq 0 ]]; then
  echo "[deploy-hook] Deploy completed successfully"
else
  echo "[deploy-hook] Deploy failed (exit $EXIT_CODE)"
  echo "[deploy-hook] Run rollback: bash $SCRIPT_DIR/rollback-staging.sh"
fi

exit $EXIT_CODE
