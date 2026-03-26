#!/usr/bin/env bash

set -euo pipefail

printf '%s\n' '[deploy-hook] Deprecated: staging deploys now run from CI or manually on the host.'
printf '%s\n' '[deploy-hook] Remove this hook from .git/hooks/post-merge if it is still installed.'
