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
  RPC_SEPOLIA    = https://blockchain.googleapis.com/v1/projects/gen-lang-client-0353869734/locations/asia-east1/endpoints/ethereum-sepolia/rpc?key=AIzaSyCygRUVltm8-BXV9UwAjKLAS6lwk8LjRFg
  RPC_WORLDCHAIN = https://worldchain-sepolia.gateway.tenderly.co
  CHAIN_ID_XLAYER = 195
  ENV_FILE       = .env.test
  KEYCHAIN_SVC   = duki-alm-deployer-test
  USDT_XLAYER    = 0xeb90e6d5386345550400201BA94a9473975CADAC
  MINTER_XLAYER  =
  MINTER_SEPOLIA = 0x7cd29f64fB3198D3c78dbbfBcd38bD3AE59734ec
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

upgrade-xlayer: check-key
	@echo "=== Upgrading DukerNews on X Layer ($(ENV)) ==="
	PROXY_ADDRESS=0x348C88cC171bffDB9128bc9DEcDa49c0820FB29F \
	forge script script/UpgradeDukerNews.s.sol:UpgradeDukerNews \
		--rpc-url $(RPC_XLAYER) \
		--broadcast \
		-vvv

deploy-local:
	@echo "=== Deploying DukerNews + MockUSDT to local Anvil ==="
	forge script script/DeployDukerRegistry.s.sol:DeployDukerRegistry \
		--rpc-url http://127.0.0.1:8545 \
		--broadcast \
		-vvv

# ═══════════════════════════════════════════════════
#  OWNERSHIP
# ═══════════════════════════════════════════════════

PROXY_ADDRESS ?= 0x348C88cC171bffDB9128bc9DEcDa49c0820FB29F
NEW_OWNER     ?= 0xBB68A2363861d595cfF23abE0AC247fd36c0e7E7

.PHONY: transfer-ownership-xlayer

transfer-ownership-xlayer: check-key
	@echo "=== Transferring ownership of $(PROXY_ADDRESS) to $(NEW_OWNER) ==="
	@echo "→ Current owner: $(shell cast call $(PROXY_ADDRESS) 'owner()(address)' --rpc-url $(RPC_XLAYER))"
	cast send $(PROXY_ADDRESS) "transferOwnership(address)" $(NEW_OWNER) \
		--rpc-url $(RPC_XLAYER) \
		--private-key $(PRIVATE_KEY)
	@echo "✅ New owner: $(shell cast call $(PROXY_ADDRESS) 'owner()(address)' --rpc-url $(RPC_XLAYER))"

# operator key (owner after transfer) — set via env or prompt
OP_KEY ?=

.PHONY: set-mint-fee-xlayer

set-mint-fee-xlayer:
ifndef OP_KEY
	$(error OP_KEY not set. Usage: OP_KEY=0x... MINT_FEE=10000 make set-mint-fee-xlayer)
endif
	@echo "=== Setting mintFee on $(PROXY_ADDRESS) to $(MINT_FEE) ==="
	@echo "→ Current mintFee: $(shell cast call $(PROXY_ADDRESS) 'mintFee()(uint256)' --rpc-url $(RPC_XLAYER))"
	cast send $(PROXY_ADDRESS) "setMintFee(uint256)" $(MINT_FEE) \
		--rpc-url $(RPC_XLAYER) \
		--private-key $(OP_KEY)
	@echo "✅ New mintFee: $(shell cast call $(PROXY_ADDRESS) 'mintFee()(uint256)' --rpc-url $(RPC_XLAYER))"

# ═══════════════════════════════════════════════════
#  BUILD & TEST
# ═══════════════════════════════════════════════════

.PHONY: build test

build:
	forge build

test:
	forge test -vvv
