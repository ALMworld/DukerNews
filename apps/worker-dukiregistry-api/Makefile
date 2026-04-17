# DukerRegistry Worker — Local Integration Testing
#
# Prerequisites: anvil, node, pnpm
#
# Quick start:
#   make test      — full e2e (deploy + schema + test)
#   make deploy    — deploy contracts to anvil
#   make worker    — start wrangler dev
#   make e2e       — run e2e test only
#
# Workflows:
#   Terminal 1: make anvil
#   Terminal 2: make worker
#   Terminal 3: make test

.PHONY: anvil worker deploy schema e2e test compile clean help

WORKER_DIR := $(shell pwd)
CONTRACT_DIR := $(WORKER_DIR)/../../packages/contract_duki_alm_world

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

# ── Anvil ─────────────────────────────────────────────

anvil: ## Start local anvil (port 8545)
	anvil --chain-id 31337

# ── Compile ───────────────────────────────────────────

compile: ## Compile Solidity contracts (hardhat)
	cd $(CONTRACT_DIR) && npx hardhat compile

# ── Deploy ────────────────────────────────────────────

deploy: compile ## Deploy contracts to anvil
	npx tsx scripts/deploy-local.ts

# ── Worker ────────────────────────────────────────────

worker: ## Start wrangler dev server (port 8788)
	npx wrangler dev --local --port 8788

# ── Schema ────────────────────────────────────────────

schema: ## Apply D1 schema (local)
	npx wrangler d1 execute duker_registry --local --file=./schemas/001_duker_registry.sql

# ── E2E Test ──────────────────────────────────────────

e2e: ## Run E2E integration test (assumes anvil + worker running)
	npx tsx scripts/test-e2e.ts

# ── Full Test ─────────────────────────────────────────

test: deploy schema e2e ## Full test: deploy → schema → e2e (anvil + worker must be running)

# ── Clean ─────────────────────────────────────────────

clean: ## Remove local deploy state and D1 data
	rm -f scripts/.deploy-local.json
	rm -rf .wrangler/state

# ── Proto ─────────────────────────────────────────────

proto: ## Regenerate proto stubs
	cd $(WORKER_DIR)/../../packages/dukiregistry-apidefs && pnpm build
