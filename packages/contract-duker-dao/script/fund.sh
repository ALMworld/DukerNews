#!/usr/bin/env bash
# Fund an address with ETH + MockUSDT on local Anvil
# Usage: ./script/fund.sh <address>
#        ./script/fund.sh --usdt-only <address>   (skip ETH, only mint USDT)

set -euo pipefail

USDT_ONLY=false
if [[ "${1:-}" == "--usdt-only" ]]; then
  USDT_ONLY=true
  shift
fi

ADDR="${1:-${FUND_ADDRESS:-}}"
if [[ -z "$ADDR" ]]; then
  echo "Usage: $0 [--usdt-only] <address>"
  exit 1
fi

RPC="${RPC_URL:-http://127.0.0.1:8545}"
DEPLOYER_KEY="${PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"

if [[ -f "deployments/local.json" ]]; then
  USDT=$(python3 -c "import json; print(json.load(open('deployments/local.json'))['MockUSDT'])" 2>/dev/null || echo "0x5FbDB2315678afecb367f032d93F642f64180aa3")
else
  USDT="0x5FbDB2315678afecb367f032d93F642f64180aa3"
fi

echo "🔗 RPC:     $RPC"
echo "💰 Funding: $ADDR"
echo "📄 USDT:    $USDT"
echo ""

# 1. Send ETH (unless --usdt-only)
if [[ "$USDT_ONLY" == false ]]; then
  echo "→ Sending 10 ETH..."
  cast send --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" "$ADDR" --value 10ether 2>&1 | tail -1
  echo "  ✅ 10 ETH sent"
fi

# 2. Mint 10,000 MockUSDT
echo "→ Minting 10,000 USDT..."
cast send --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" "$USDT" \
  "mint(address,uint256)" "$ADDR" 10000000000 2>&1 | tail -1
echo "  ✅ 10,000 USDT minted"

# 3. Verify balances
ETH_BAL=$(cast balance --rpc-url "$RPC" "$ADDR" --ether)
USDT_BAL=$(cast call --rpc-url "$RPC" "$USDT" "balanceOf(address)(uint256)" "$ADDR")
echo ""
echo "📊 Balances for $ADDR:"
echo "   ETH:  $ETH_BAL"
echo "   USDT: $USDT_BAL (raw, 6 decimals)"
