#!/usr/bin/env bash
#
# reset-and-seed.sh — Reset local D1 database and re-seed with HN data.
#
# Usage:
#   ./scripts/reset-and-seed.sh              # Reset DB + seed top 40 HN stories
#   ./scripts/reset-and-seed.sh --skip-fetch  # Reset DB + seed from cached data
#   ./scripts/reset-and-seed.sh --reset-only  # Just reset DB, no seeding
#   ./scripts/reset-and-seed.sh --seed-only   # Seed only, no reset
#
# Requires: wrangler, tsx, a running dev server on localhost:3000
#

set -euo pipefail

DB_NAME="duker-news-db"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SEED_SCRIPT="$SCRIPT_DIR/import-hn.ts"
NUM_STORIES="${NUM_STORIES:-40}"

cd "$APP_DIR"

echo "🗄️  Duker News — Database Reset & Seed"
echo "──────────────────────────────────────"

# ── Step 1: Clear data ───────────────────────────────────
if [[ "${1:-}" != "--seed-only" ]]; then
  echo ""
  echo "🧹 Clearing all data..."
  npx wrangler d1 execute "$DB_NAME" --local \
    --command "DELETE FROM comments; DELETE FROM votes; DELETE FROM posts; DELETE FROM users;" \
    2>/dev/null || true
  echo "  ✅ Data cleared"

  # Re-apply migrations (idempotent — CREATE IF NOT EXISTS)
  echo ""
  echo "📐 Applying migrations..."
  npx wrangler d1 migrations apply "$DB_NAME" --local 2>&1 | tail -3
  echo "  ✅ Migrations applied"
fi

# ── Step 2: Verify empty DB ──────────────────────────────
echo ""
echo "📋 Checking DB state..."
npx wrangler d1 execute "$DB_NAME" --local \
  --command "SELECT count(*) as cnt FROM posts" 2>&1 | tail -5

# ── Step 3: Seed ─────────────────────────────────────────
if [[ "${1:-}" == "--reset-only" ]]; then
  echo ""
  echo "⏭️  Skipping seed (--reset-only)"
  echo "✨ Done! Database reset complete."
  exit 0
fi

echo ""
echo "🌱 Seeding database with $NUM_STORIES stories..."

EXTRA_ENV=""
if [[ "${1:-}" == "--skip-fetch" ]]; then
  export SKIP_FETCH=1
  echo "  📁 Using cached data (SKIP_FETCH=1)"
fi

# Fetch top story IDs from HN Firebase API, take first N
echo "  📡 Fetching top story IDs from HN..."
HN_IDS=$(curl -s 'https://hacker-news.firebaseio.com/v0/topstories.json' \
  | tr -d '[]' | tr ',' '\n' | head -n "$NUM_STORIES" | tr '\n' ' ')
echo "  📋 Got $(echo $HN_IDS | wc -w | tr -d ' ') story IDs"

npx tsx "$SEED_SCRIPT" $HN_IDS

echo ""
echo "📊 Final stats:"
npx wrangler d1 execute "$DB_NAME" --local \
  --command "SELECT count(*) as total_posts, sum(CASE WHEN post_data IS NOT NULL THEN 1 ELSE 0 END) as works_posts FROM posts" 2>&1 | tail -5
echo ""
echo "✨ Done! Database reset and seeded."
