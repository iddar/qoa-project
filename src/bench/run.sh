#!/usr/bin/env bash
# =============================================================================
# QOA Core – Performance Benchmark (hey)
# =============================================================================
# Usage:
#   ./bench/run.sh                  # run all benchmarks
#   ./bench/run.sh --save-baseline  # run all benchmarks + save results as baseline
#   ./bench/run.sh --compare        # run all benchmarks + compare with latest baseline
#   ./bench/run.sh health           # run a single suite (health|stores|transactions|campaigns|reports|post_transaction)
#
# Required env vars (from db:seed:local output):
#   BENCH_USER_ID      UUID of the seed consumer user
#   BENCH_STORE_ID     UUID of the seed store
#   BENCH_PRODUCT_ID   UUID of the seed product
#   BENCH_CARD_ID      UUID of the consumer's universal wallet card (optional for write suite)
#
# Optional tuning env vars:
#   BASE_URL           default: http://localhost:3000
#   CONCURRENCY        default: 10  (parallel workers hey uses)
#   REQUESTS           default: 200 (total requests per suite)
#   HEY_EXTRA_FLAGS    any extra flags to pass to hey (e.g. "-disable-keepalive")
# =============================================================================

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
BASE_URL="${BASE_URL:-http://localhost:3000}"
CONCURRENCY="${CONCURRENCY:-10}"
REQUESTS="${REQUESTS:-200}"
HEY_EXTRA_FLAGS="${HEY_EXTRA_FLAGS:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/results"
mkdir -p "$RESULTS_DIR"

# Seed IDs (required for write-path suites)
BENCH_USER_ID="${BENCH_USER_ID:-}"
BENCH_STORE_ID="${BENCH_STORE_ID:-}"
BENCH_PRODUCT_ID="${BENCH_PRODUCT_ID:-}"
BENCH_CARD_ID="${BENCH_CARD_ID:-}"

# Auth headers (dev mode – no real tokens needed)
DEV_AUTH_HEADER="Authorization: Bearer dev-token"
DEV_ROLE_HEADER="x-dev-user-role: qoa_admin"
DEV_USER_HEADER="x-dev-user-id: dev-admin"
AUTH_MODE="AUTH_DEV_MODE=true"

# Flags
SAVE_BASELINE=false
COMPARE=false
SUITE_FILTER=""

for arg in "$@"; do
  case "$arg" in
    --save-baseline) SAVE_BASELINE=true ;;
    --compare)       COMPARE=true ;;
    *)               SUITE_FILTER="$arg" ;;
  esac
done

TIMESTAMP="$(date +%Y%m%dT%H%M%S)"
RUN_OUTPUT="$RESULTS_DIR/run-$TIMESTAMP.txt"

# ── Helpers ───────────────────────────────────────────────────────────────────
bold()  { printf '\033[1m%s\033[0m' "$*"; }
green() { printf '\033[32m%s\033[0m' "$*"; }
cyan()  { printf '\033[36m%s\033[0m' "$*"; }
red()   { printf '\033[31m%s\033[0m' "$*"; }
dim()   { printf '\033[2m%s\033[0m' "$*"; }

log_header() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  printf "  $(bold "SUITE:") $(cyan "$1")\n"
  printf "  $(dim "URL:")  %s\n" "$2"
  printf "  $(dim "Concurrency:") %s  $(dim "Requests:") %s\n" "$CONCURRENCY" "$REQUESTS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

run_hey_get() {
  local suite="$1"
  local url="$2"
  log_header "$suite" "$url"
  hey \
    -n "$REQUESTS" \
    -c "$CONCURRENCY" \
    -H "$DEV_AUTH_HEADER" \
    -H "$DEV_ROLE_HEADER" \
    -H "$DEV_USER_HEADER" \
    $HEY_EXTRA_FLAGS \
    "$url"
}

run_hey_post() {
  local suite="$1"
  local url="$2"
  local body="$3"
  log_header "$suite" "$url"
  hey \
    -n "$REQUESTS" \
    -c "$CONCURRENCY" \
    -m POST \
    -H "Content-Type: application/json" \
    -H "$DEV_AUTH_HEADER" \
    -H "$DEV_ROLE_HEADER" \
    -H "$DEV_USER_HEADER" \
    -d "$body" \
    $HEY_EXTRA_FLAGS \
    "$url"
}

check_server() {
  if ! curl -sf "$BASE_URL/v1/health" -o /dev/null 2>&1; then
    red "ERROR: No se pudo conectar a $BASE_URL/v1/health"
    echo ""
    echo "  Asegúrate de que el servidor esté corriendo:"
    echo "    bun run --cwd src dev"
    echo ""
    exit 1
  fi
}

# ── Suites ────────────────────────────────────────────────────────────────────

suite_health() {
  run_hey_get "GET /v1/health  [baseline sin DB]" \
    "$BASE_URL/v1/health"
}

suite_stores() {
  run_hey_get "GET /v1/stores  [list con cursor-pagination]" \
    "$BASE_URL/v1/stores?limit=20"
}

suite_transactions() {
  run_hey_get "GET /v1/transactions  [list filtrado + cursor-pagination]" \
    "$BASE_URL/v1/transactions?limit=20"
}

suite_campaigns() {
  run_hey_get "GET /v1/campaigns  [list con tenant-scope]" \
    "$BASE_URL/v1/campaigns?limit=20"
}

suite_reports() {
  run_hey_get "GET /v1/reports/overview  [query agregada]" \
    "$BASE_URL/v1/reports/overview"
}

suite_post_transaction() {
  if [[ -z "$BENCH_USER_ID" || -z "$BENCH_STORE_ID" || -z "$BENCH_PRODUCT_ID" ]]; then
    printf "  $(dim "  → SKIPPED: falta BENCH_USER_ID / BENCH_STORE_ID / BENCH_PRODUCT_ID")\n"
    echo "    Corre el seed con 'bun run db:seed:local' desde /src y configura las variables."
    return 0
  fi

  local idempotency_key="bench-$(date +%s%N)"

  # Construir body – si hay BENCH_CARD_ID lo incluimos, de lo contrario omitimos
  local body
  if [[ -n "$BENCH_CARD_ID" ]]; then
    body="{\"userId\":\"$BENCH_USER_ID\",\"storeId\":\"$BENCH_STORE_ID\",\"cardId\":\"$BENCH_CARD_ID\",\"items\":[{\"productId\":\"$BENCH_PRODUCT_ID\",\"quantity\":1,\"amount\":100}]}"
  else
    body="{\"userId\":\"$BENCH_USER_ID\",\"storeId\":\"$BENCH_STORE_ID\",\"items\":[{\"productId\":\"$BENCH_PRODUCT_ID\",\"quantity\":1,\"amount\":100}]}"
  fi

  run_hey_post "POST /v1/transactions  [write-path crítico: DB + acumulaciones]" \
    "$BASE_URL/v1/transactions" \
    "$body"
}

# ── Comparar con baseline ─────────────────────────────────────────────────────
compare_with_baseline() {
  local latest_baseline
  latest_baseline="$(ls -t "$RESULTS_DIR"/baseline-*.txt 2>/dev/null | head -1)"

  if [[ -z "$latest_baseline" ]]; then
    dim "  No se encontró un baseline guardado. Corre primero con --save-baseline."
    return
  fi

  echo ""
  bold "COMPARACIÓN vs BASELINE"
  dim "  Baseline: $latest_baseline"
  echo ""

  # Extraer p50 / p99 / rps de archivos usando grep
  local extract_p50 extract_p99 extract_rps
  extract_stat() {
    local file="$1"
    local suite="$2"
    # hey output example: "  50% in 0.0123 secs"
    # We grab lines after the suite header
    grep -A 40 "SUITE: $suite" "$file" 2>/dev/null \
      | grep -E "50%|99%|Requests/sec" \
      | head -3 \
      | sed 's/^[[:space:]]*//' \
      | tr '\n' '  ' || echo "n/a"
  }

  for suite in "GET /v1/health" "GET /v1/stores" "GET /v1/transactions" "GET /v1/campaigns" "GET /v1/reports/overview" "POST /v1/transactions"; do
    echo "  Suite: $(cyan "$suite")"
    printf "    $(dim "baseline:") %s\n" "$(extract_stat "$latest_baseline" "$suite")"
    printf "    $(dim "current: ") %s\n" "$(extract_stat "$RUN_OUTPUT" "$suite")"
    echo ""
  done
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  echo ""
  bold "QOA Core – Benchmark de Performance"
  printf "  Fecha:       %s\n" "$(date)"
  printf "  Servidor:    %s\n" "$BASE_URL"
  printf "  Concurrency: %s\n" "$CONCURRENCY"
  printf "  Requests:    %s\n" "$REQUESTS"
  echo ""

  check_server
  green "  Servidor OK"
  echo ""

  # Redirige también a archivo
  exec > >(tee "$RUN_OUTPUT") 2>&1

  case "${SUITE_FILTER:-all}" in
    health)            suite_health ;;
    stores)            suite_stores ;;
    transactions)      suite_transactions ;;
    campaigns)         suite_campaigns ;;
    reports)           suite_reports ;;
    post_transaction)  suite_post_transaction ;;
    all)
      suite_health
      suite_stores
      suite_transactions
      suite_campaigns
      suite_reports
      suite_post_transaction
      ;;
    *)
      red "Suite desconocida: $SUITE_FILTER"
      echo "Suites disponibles: health | stores | transactions | campaigns | reports | post_transaction"
      exit 1
      ;;
  esac

  echo ""
  bold "Benchmark completado."
  dim "  Resultados guardados en: $RUN_OUTPUT"

  if $SAVE_BASELINE; then
    local baseline_file="$RESULTS_DIR/baseline-$TIMESTAMP.txt"
    cp "$RUN_OUTPUT" "$baseline_file"
    echo ""
    green "  Baseline guardado en: $baseline_file"
  fi

  if $COMPARE; then
    compare_with_baseline
  fi

  echo ""
}

main
