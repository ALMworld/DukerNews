# DukerRegistry Worker — Local Development
#
# Prerequisites: anvil, node, pnpm, forge, cast
#
# First time setup:
#   make anvil          — start anvil with persistent state (Terminal 1)
#   make deploy         — deploy full ALM stack to anvil
#   make fund ADDR=0xBB68A2363861d595cfF23abE0AC247fd36c0e7E7 — fund an address with ETH + USDT
#   make worker         — start wrangler dev (Terminal 2)
#
# After restart (state persists):
#   make anvil          — start anvil (loads saved state)
#   make worker         — start wrangler dev
#
# Testing:
#   make e2e            — run e2e integration test
#   make test           — full: deploy → schema → e2e
#
# Reset:
#   make reset          — wipe anvil state + D1 data (will need redeploy)

.PHONY: anvil worker deploy schema e2e test compile clean help fund reset

WORKER_DIR := $(shell pwd)
ALM_PKG := $(WORKER_DIR)/../../packages/contract_duki_alm_world
ANVIL_STATE := $(WORKER_DIR)/../../.anvil-state.json
ANVIL_KEY := 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
RPC := http://127.0.0.1:8545
WORKER_URL := http://localhost:8788

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# ── Anvil (persistent) ──────────────────────────────────

anvil: ## Start anvil with persistent state
	anvil --chain-id 31337 --code-size-limit 100000 --state $(ANVIL_STATE)

# ── Compile ──────────────────────────────────────────────

compile: ## Compile Solidity contracts (forge)
	cd $(ALM_PKG) && forge build --force --extra-output-files abi

# ── Deploy ───────────────────────────────────────────────

deploy: ## Deploy full ALM stack to anvil (delegates to contract_duki_alm_world)
	cd $(ALM_PKG) && make deploy-local

# ── Fund ─────────────────────────────────────────────────

fund: ## Fund address with 100 ETH + 10K USDT — usage: make fund ADDR=0x…
ifndef ADDR
	$(error ADDR is required. Usage: make fund ADDR=0x…)
endif
	@echo "Funding $(ADDR)..."
	@cast rpc anvil_setBalance $(ADDR) 0x56BC75E2D63100000 --rpc-url $(RPC) > /dev/null
	@echo "  ✓ 100 ETH"

# ── Worker ───────────────────────────────────────────────

worker: ## Start wrangler dev server (port 8788)
	npx wrangler dev --local

# ── Schema ───────────────────────────────────────────────

schema: ## Apply D1 schema (local)
	npx wrangler d1 execute duker_registry --local --file=./schemas/001_duker_registry.sql

# ── E2E Test ─────────────────────────────────────────────

e2e: ## Run E2E integration test (assumes anvil + worker running)
	npx tsx scripts/test-e2e.ts

e2e-sync: ## Run SyncDukerEvents E2E test (assumes anvil + worker running)
	npx tsx scripts/test-sync-e2e.ts

# ── Full Test ────────────────────────────────────────────

test: deploy schema e2e ## Full test: deploy → schema → e2e (anvil + worker must be running)

# ── Reset ────────────────────────────────────────────────

reset: ## Wipe anvil state + D1 data (will need full redeploy)
	rm -f $(ANVIL_STATE)
	rm -rf .wrangler/state
	@echo "✓ State cleared. Run 'make deploy' after restarting anvil."

clean: reset ## Alias for reset

# ── Proto ────────────────────────────────────────────────

proto: ## Regenerate proto stubs
	cd $(WORKER_DIR)/../../packages/dukiregistry-apidefs && pnpm build
