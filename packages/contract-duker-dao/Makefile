# ═══════════════════════════════════════════════════
#  DukerNews Contract Deployment
# ═══════════════════════════════════════════════════
#
#  Usage:
#    make deploy-xlayer              # testnet (default)
#    ENV=prod make deploy-xlayer     # mainnet
#    make deploy-sepolia             # Sepolia testnet
#
#  Key management: same macOS Keychain as contract_duki_alm_world
#    ../contract_duki_alm_world/scripts/save-key.sh        # testnet
#    ../contract_duki_alm_world/scripts/save-key.sh prod   # mainnet
#

# ── Environment: test (default) or prod ──

ENV ?= test

ifeq ($(ENV),prod)
  RPC_XLAYER     = https://rpc.xlayer.tech
  RPC_SEPOLIA    = https://1rpc.io/sepolia
  RPC_WORLDCHAIN = https://worldchain-mainnet.g.alchemy.com/public
  CHAIN_ID_XLAYER = 196
  ENV_FILE       = .env.production
  KEYCHAIN_SVC   = duki-alm-deployer-prod
  USDT_XLAYER    = 0x779Ded0c9e1022225f8E0630b35a9b54bE713736
  # Minter on X Layer mainnet (AlmWorldDukiMinter)
  MINTER_XLAYER  = 0x22c672f9382c86A4BBDc151cFa8EA8ebc1076D87
else
  RPC_XLAYER     = https://testrpc.xlayer.tech
  RPC_SEPOLIA    = https://1rpc.io/sepolia
  RPC_WORLDCHAIN = https://worldchain-sepolia.gateway.tenderly.co
  CHAIN_ID_XLAYER = 195
  ENV_FILE       = .env.test
  KEYCHAIN_SVC   = duki-alm-deployer-test
  USDT_XLAYER    = 0xeb90e6d5386345550400201BA94a9473975CADAC
  MINTER_XLAYER  =
endif

# ── Load PRIVATE_KEY from macOS Keychain ──
PRIVATE_KEY ?= $(shell security find-generic-password -a "deployer" -s "$(KEYCHAIN_SVC)" -w 2>/dev/null)
export PRIVATE_KEY

# ── Deployer address ──
DEPLOYER = $(shell cast wallet address "$(PRIVATE_KEY)" 2>/dev/null)

# ═══════════════════════════════════════════════════
#  DEPLOY
# ═══════════════════════════════════════════════════

.PHONY: check-key deploy-xlayer deploy-sepolia deploy-local

check-key:
ifndef PRIVATE_KEY
	$(error PRIVATE_KEY not found in Keychain. Run: ../contract_duki_alm_world/scripts/save-key.sh)
endif
	@echo "→ PRIVATE_KEY loaded from Keychain ($(KEYCHAIN_SVC))"
	@echo "→ Deployer: $(DEPLOYER)"

deploy-xlayer: check-key
	@echo "=== Deploying DukerNews to X Layer ($(ENV)) ==="
	USDT_ADDRESS=$(USDT_XLAYER) \
	MINTER_ADDRESS=$(MINTER_XLAYER) \
	TREASURY_ADDRESS=$(DEPLOYER) \
	forge script script/DeployDukerNews.s.sol:DeployDukerNews \
		--rpc-url $(RPC_XLAYER) \
		--broadcast \
		--verify \
		-vvv

deploy-sepolia: check-key
	@echo "=== Deploying DukerNews to Sepolia ($(ENV)) ==="
	forge script script/DeployDukerNews.s.sol:DeployDukerNews \
		--rpc-url $(RPC_SEPOLIA) \
		--broadcast \
		-vvv

deploy-local:
	@echo "=== Deploying DukerNews + MockUSDT to local Anvil ==="
	forge script script/DeployDukerRegistry.s.sol:DeployDukerRegistry \
		--rpc-url http://127.0.0.1:8545 \
		--broadcast \
		-vvv

# ═══════════════════════════════════════════════════
#  BUILD & TEST
# ═══════════════════════════════════════════════════

.PHONY: build test

build:
	forge build

test:
	forge test -vvv
