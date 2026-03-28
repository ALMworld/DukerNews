# ═══════════════════════════════════════════════════════════════
#  DukerNews WebApp — Developer Makefile
#
#  Usage:
#    make dev-xlayer          # dev server → XLayer mainnet (loads key from Keychain)
#    make dev-sepolia         # dev server → Sepolia testnet
#    make dev-local           # dev server → local Anvil
#    make test-okx-api        # smoke test: verify OKX API keys + send 0.01 USDT
#
#  Secrets: loaded from .env (git-ignored) — never hardcoded here.
#  Keychain service: duki-alm-deployer-prod (for OPERATOR_PRIVATE_KEY).
# ═══════════════════════════════════════════════════════════════

# ── Load secrets from .env (ignored by git) ──────────────────────────────────
# Values in .env override defaults; Makefile vars can still be overridden on CLI.
ifneq (,$(wildcard .env))
  include .env
  export
endif

# ── Production operator key from macOS Keychain ───────────────────────────────
# Loaded at runtime so the key never sits in any file.
KEYCHAIN_SVC_PROD = duki-alm-deployer-prod
PRIVATE_KEY_PROD ?= $(shell security find-generic-password -a "deployer" -s "$(KEYCHAIN_SVC_PROD)" -w 2>/dev/null)

# ── XLayer deployer address ───────────────────────────────────────────────────
DEPLOYER_XLAYER = 0xd495eb837423d8749aaed557550249542f749b3f

# ── RPC endpoints (can be overridden in .env) ────────────────────────────────
RPC_XLAYER  ?= https://rpc.xlayer.tech
RPC_SEPOLIA ?= https://1rpc.io/sepolia

.PHONY: check-key dev-xlayer dev-sepolia dev-local test-okx-api

check-key:
ifndef PRIVATE_KEY_PROD
	$(error PRIVATE_KEY not found in Keychain. Run: ../contract_duki_alm_world/scripts/save-key.sh prod)
endif
ifndef OKX_API_KEY
	$(error OKX_API_KEY missing — add it to apps/webapp/.env)
endif
	@echo "→ Operator key loaded from Keychain ($(KEYCHAIN_SVC_PROD))"
	@echo "→ Deployer: $(DEPLOYER_XLAYER)"
	@echo "→ OKX_API_KEY: $(OKX_API_KEY)"

# ── Dev servers ──────────────────────────────────────────────────────────────

dev-xlayer: check-key
	@echo "=== DukerNews dev → XLayer Mainnet ==="
	CHAIN=xlayer \
	VITE_CHAIN=xlayer \
	OPERATOR_PRIVATE_KEY=$(PRIVATE_KEY_PROD) \
	RPC_URL_XLAYER=$(RPC_XLAYER) \
	pnpm dev

dev-sepolia:
	@echo "=== DukerNews dev → Sepolia Testnet (mock settle) ==="
	CHAIN=sepolia \
	VITE_CHAIN=sepolia \
	pnpm dev

# Sepolia with real OKX verify+settle (loads key from Keychain for operator)
dev-sepolia-okx: check-key
	@echo "=== DukerNews dev → Sepolia Testnet + real OKX settle ==="
	CHAIN=sepolia \
	VITE_CHAIN=sepolia \
	OKX_SETTLE=true \
	VITE_OKX_SETTLE=true \
	OPERATOR_PRIVATE_KEY=$(PRIVATE_KEY_PROD) \
	pnpm dev

dev-local:
	@echo "=== DukerNews dev → Local Anvil ==="
	CHAIN=local \
	VITE_CHAIN=local \
	pnpm dev

# ── OKX API smoke test ────────────────────────────────────────────────────────
#
# Tests:
#   1. /api/v6/x402/supported endpoint (verifies API keys)
#   2. Sends 0.01 USDT from deployer wallet → 0xd495eb837423d8749aaed557550249542f749b3f
#      (XLayer mainnet, real on-chain transfer)

test-okx-api: check-key
	@echo "=== OKX x402 API Smoke Test (XLayer Mainnet) ==="
	OPERATOR_PRIVATE_KEY=$(PRIVATE_KEY_PROD) \
	npx tsx tests/test-okx402.ts
