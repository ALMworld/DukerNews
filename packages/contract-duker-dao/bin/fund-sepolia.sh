#!/usr/bin/env bash
# fund-sepolia.sh — Mint MockUSDT to an address on Sepolia testnet
#
# Usage:
#   ./bin/fund-sepolia.sh 0xYourAddress
#   ./bin/fund-sepolia.sh 0xYourAddress 50000       # 50,000 USDT (default: 10,000)
#
# Reads deployer key from macOS Keychain (duki-alm-deployer-test),
# or falls back to PRIVATE_KEY env var.

set -euo pipefail

TO="${1:?Usage: fund-sepolia.sh <address> [usdt_amount]}"
USDT_AMOUNT="${2:-10000}"

# MockUSDT on Sepolia (6 decimals)
MOCK_USDT="0xdFc84469Bf8c7A2ba98090bde94f5F9fc3Ec2066"
RPC="https://1rpc.io/sepolia"

# Raw amount = USDT_AMOUNT * 10^6
RAW=$(python3 -c "print(int($USDT_AMOUNT * 10**6))")

# Load private key
if KEY=$(security find-generic-password -a "deployer" -s "duki-alm-deployer-test" -w 2>/dev/null); then
    DEPLOYER_KEY="$KEY"
elif [[ -n "${PRIVATE_KEY:-}" ]]; then
    DEPLOYER_KEY="$PRIVATE_KEY"
else
    echo "❌ No key found. Set PRIVATE_KEY env or store in Keychain as 'duki-alm-deployer-test'."
    exit 1
fi

echo "🔗 RPC:     $RPC"
echo "📄 USDT:    $MOCK_USDT"
echo "💰 Minting: $USDT_AMOUNT USDT → $TO"
echo ""

cast send \
    --rpc-url "$RPC" \
    --private-key "$DEPLOYER_KEY" \
    "$MOCK_USDT" \
    "mint(address,uint256)" \
    "$TO" "$RAW"

echo ""
BAL=$(cast call --rpc-url "$RPC" "$MOCK_USDT" "balanceOf(address)(uint256)" "$TO")
echo "✅ Done. Balance: $(python3 -c "print($BAL / 10**6)") USDT"
