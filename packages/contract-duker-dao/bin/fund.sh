#!/usr/bin/env bash
# fund.sh — Fund a test address with ETH + MockUSDT on local Anvil
#
# Usage:
#   ./bin/fund.sh 0xYourAddress
#   ./bin/fund.sh 0xYourAddress 2        # 2 ETH (default: 1)
#   ./bin/fund.sh 0xYourAddress 1 50000  # 1 ETH + 50000 USDT

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

TO="${1:?Usage: fund.sh <address> [eth_amount] [usdt_amount]}"
ETH="${2:-1}"
USDT="${3:-10000}"

# Convert ETH to wei
ETH_WEI=$(python3 -c "print(int($ETH * 10**18))")

echo "▶ Funding $TO with $ETH ETH + $USDT USDT on Anvil..."

cd "$REPO_ROOT"

FUND_TO="$TO" \
FUND_ETH_WEI="$ETH_WEI" \
FUND_USDT="$USDT" \
forge script script/FundAccount.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast \
  --quiet

echo "✅ Done."
