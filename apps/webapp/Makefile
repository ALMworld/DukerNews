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

.PHONY: check-key dev-xlayer dev-sepolia dev-local reset-db anvil-local deploy-local fund-local test-okx-api

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

# ── Database reset ────────────────────────────────────────────────────────────
# Wipes the local D1 SQLite database used by wrangler dev.
# Schema migrations re-run automatically on next request.

reset-db:
	@echo "=== Truncating local D1 tables ==="
	pnpm wrangler d1 execute duker-news-db --local \
		--command "DELETE FROM translations; DELETE FROM duker_payments; DELETE FROM user_interactions; DELETE FROM events; DELETE FROM comments; DELETE FROM posts; DELETE FROM users;"
	@echo "✓ All table data cleared. Schema preserved."

# ── Local Anvil deploy + fund ─────────────────────────────────────────────────
# deploy-local:  Deploys ALM stack + DukerNews DAO → patches contracts.ts.
#                Requires a FRESH Anvil running on port 8545.
#                Start manually:  anvil --chain-id 31337 --code-size-limit 100000
# fund-local:    Sends ETH + transfers MockUSDT to FUND_TO.

ALM_PKG         = ../../packages/contract_duki_alm_world
DAO_PKG         = ../../packages/contract-dukernews-dao
ALM_DEPLOY_JSON = $(ALM_PKG)/scripts/.deploy-local.json
DAO_DEPLOY_JSON = $(DAO_PKG)/deployments/local.json
CONTRACTS_TS    = src/lib/contracts.ts
ANVIL_RPC       = http://127.0.0.1:8545
ANVIL_KEY_0     = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
FUND_TO        ?= 0xBB68A2363861d595cfF23abE0AC247fd36c0e7E7
FUND_ETH       ?= 10
FUND_USDT      ?= 10000

deploy-local: ## Deploy ALM stack + DukerNews DAO to fresh Anvil, then patch contracts.ts
	@echo "=== Phase 1: Deploying ALM stack (contract_duki_alm_world) ==="
	cd $(ALM_PKG) && make deploy-local
	@echo ""
	@echo "=== Phase 2: Deploying DukerNews DAO (contract-dukernews-dao) ==="
	cd $(DAO_PKG) && make deploy-local
	@echo ""
	@echo "=== Phase 3: Patching contracts.ts ==="
	@python3 scripts/patch-contracts.py $(ALM_DEPLOY_JSON) $(DAO_DEPLOY_JSON) $(CONTRACTS_TS)
	@echo ""
	@echo "✅ All contracts deployed and contracts.ts patched!"
	@echo "   Run 'pnpm dev' to start the webapp."

fund-local:
	@echo "=== Funding $(FUND_TO) on Anvil ==="
	@USDT_ADDR=$$(python3 -c "import json; print(json.load(open('$(ALM_DEPLOY_JSON)'))['mockUsdt'])") && \
	echo "→ MockUSDT at $$USDT_ADDR" && \
	echo "→ Sending $(FUND_ETH) ETH…" && \
	cast send $(FUND_TO) --value $(FUND_ETH)ether \
		--rpc-url $(ANVIL_RPC) --private-key $(ANVIL_KEY_0) && \
	echo "→ Minting $(FUND_USDT) MockUSDT…" && \
	cast send $$USDT_ADDR "mint(address,uint256)" $(FUND_TO) $$(echo "$(FUND_USDT) * 1000000" | bc) \
		--rpc-url $(ANVIL_RPC) --private-key $(ANVIL_KEY_0) && \
	echo "✓ Funded: $(FUND_ETH) ETH + $(FUND_USDT) USDT → $(FUND_TO)"

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
