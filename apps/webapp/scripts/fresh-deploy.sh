#!/usr/bin/env bash
#
# fresh-deploy.sh — Fresh-deploy DukerNews contract and reset the database.
#
# Usage:  pnpm fresh-deploy
#         pnpm fresh-deploy --no-db
#         pnpm fresh-deploy --no-deploy
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEBAPP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$WEBAPP_DIR/../.." && pwd)"
CONTRACT_DIR="$REPO_ROOT/packages/contract-duker-dao"
CONTRACTS_TS="$WEBAPP_DIR/src/lib/contracts.ts"

RPC="${RPC_URL:-http://127.0.0.1:8545}"
DEPLOYER_KEY="${PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
DB_NAME="duker-news-db"

SKIP_DB=false
SKIP_DEPLOY=false

for arg in "$@"; do
  case "$arg" in
    --no-db)      SKIP_DB=true ;;
    --no-deploy)  SKIP_DEPLOY=true ;;
  esac
done

echo "🚀 Duker News — Fresh Deploy & Reset"
echo "═══════════════════════════════════════"
echo ""

# ── Step 1: Deploy fresh DukerNews ───────────────────────────
if [[ "$SKIP_DEPLOY" == false ]]; then
  echo "📦 Deploying fresh DukerNews contract..."

  cd "$CONTRACT_DIR"

  forge script script/DeployDukerNews.s.sol:DeployDukerNews \
    --rpc-url "$RPC" \
    --private-key "$DEPLOYER_KEY" \
    --broadcast \
    -vvv 2>&1 | grep -E "^(===|DukerNews|USDT|Treasury|Written)" || true

  NEW_ADDR=$(python3 -c "import json; print(json.load(open('deployments/x402.json'))['DukerNews'])")
  echo "  ✅ Deployed at: $NEW_ADDR"

  # Update contracts.ts
  if [[ -f "$CONTRACTS_TS" ]]; then
    sed -i '' "s|DukerNews: '0x[a-fA-F0-9]\{40\}'|DukerNews: '$NEW_ADDR'|" "$CONTRACTS_TS"
    echo "  ✅ Updated contracts.ts"
  fi
else
  echo "⏭️  Skipping deploy (--no-deploy)"
fi

# ── Step 2: Reset database ───────────────────────────────────
if [[ "$SKIP_DB" == false ]]; then
  echo ""
  echo "🧹 Resetting database..."

  cd "$WEBAPP_DIR"

  # Kill dev server if running (it locks the SQLite DB)
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true

  # Find and delete the D1 SQLite file directly (fastest, no lock issues)
  D1_DIR="$WEBAPP_DIR/.wrangler/state/v3/d1"
  if [[ -d "$D1_DIR" ]]; then
    find "$D1_DIR" -name "*.sqlite" -delete 2>/dev/null || true
    find "$D1_DIR" -name "*.sqlite-wal" -delete 2>/dev/null || true
    find "$D1_DIR" -name "*.sqlite-shm" -delete 2>/dev/null || true
    echo "  ✅ Database files deleted"
  fi

  # Apply migrations using local wrangler
  echo "  📐 Applying migrations..."
  pnpm exec wrangler d1 migrations apply "$DB_NAME" --local 2>&1 | tail -5
  echo "  ✅ Fresh DB ready"
else
  echo "⏭️  Skipping DB reset (--no-db)"
fi

echo ""
echo "✨ Done! Start dev server: pnpm dev"
