#!/usr/bin/env tsx
/**
 * deploy-local.ts — Deploy DukerRegistry to local Anvil for integration testing.
 *
 * Usage:
 *   1. Start anvil:   anvil --chain-id 31337
 *   2. Run this:      npx tsx scripts/deploy-local.ts
 *   3. Start worker:  npx wrangler dev --local
 *   4. Apply schema:  npx wrangler d1 execute duker_registry --local --file=./schemas/001_duker_registry.sql
 *   5. Run tests:     npx tsx scripts/test-e2e.ts
 *
 * Outputs a JSON with deployed addresses to scripts/.deploy-local.json
 */

import { createWalletClient, createPublicClient, http, parseAbi, encodeFunctionData, getAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Anvil default accounts
const ANVIL_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
const ANVIL_ACCOUNT = privateKeyToAccount(ANVIL_PRIVATE_KEY)
const LOCAL_CHAIN_EID = 31337

const RPC_URL = 'http://127.0.0.1:8545'

const walletClient = createWalletClient({
    account: ANVIL_ACCOUNT,
    chain: foundry,
    transport: http(RPC_URL),
})

const publicClient = createPublicClient({
    chain: foundry,
    transport: http(RPC_URL),
})

// ── Helpers ────────────────────────────────────────────────────

function loadArtifact(path: string): { abi: any[]; bytecode: `0x${string}` } {
    const contractDir = resolve(__dirname, '../../../packages/contract_duki_alm_world')
    const json = JSON.parse(readFileSync(resolve(contractDir, path), 'utf-8'))
    const bc = typeof json.bytecode === 'string' ? json.bytecode : json.bytecode?.object
    return { abi: json.abi, bytecode: bc as `0x${string}` }
}

function loadNodeModulesArtifact(relativePath: string): { abi: any[]; bytecode: `0x${string}` } {
    const rootDir = resolve(__dirname, '../../..')
    const json = JSON.parse(readFileSync(resolve(rootDir, relativePath), 'utf-8'))
    const bc = typeof json.bytecode === 'string' ? json.bytecode : json.bytecode?.object
    return { abi: json.abi, bytecode: bc as `0x${string}` }
}

async function deploy(abi: any[], bytecode: `0x${string}`, args: any[] = []): Promise<`0x${string}`> {
    const hash = await walletClient.deployContract({ abi, bytecode, args })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (!receipt.contractAddress) throw new Error('Deploy failed — no contract address')
    return getAddress(receipt.contractAddress)
}

// ── Mock Stablecoin ────────────────────────────────────────────

async function main() {
    console.log('🔧 Deploying DukerRegistry to local Anvil...\n')
    console.log(`  Account: ${ANVIL_ACCOUNT.address}`)
    console.log(`  Chain EID: ${LOCAL_CHAIN_EID}`)
    console.log(`  RPC: ${RPC_URL}\n`)

    // ── 1. Deploy EndpointV2Mock ──────────────────────────────
    console.log('  [1/5] Deploying EndpointV2Mock...')
    const endpointArtifact = loadNodeModulesArtifact(
        'node_modules/.pnpm/@layerzerolabs+oapp-evm-upgradeable@0.1.3_3fc77d2f2122a51369ef4c36a073e9cf/node_modules/@layerzerolabs/oapp-evm-upgradeable/artifacts/EndpointV2Mock.sol/EndpointV2Mock.json'
    )
    const endpointAddr = await deploy(endpointArtifact.abi, endpointArtifact.bytecode, [LOCAL_CHAIN_EID, ANVIL_ACCOUNT.address])
    console.log(`        ✓ EndpointV2Mock: ${endpointAddr}`)

    // ── 2. Deploy Mock Stablecoin ────────────────────────────
    console.log('  [2/5] Deploying MockUSDT...')
    const mockUsdtArtifact = loadArtifact('artifacts/contracts/mocks/MockUSDT.sol/MockUSDT.json')
    const mockUsdtAddr = await deploy(mockUsdtArtifact.abi, mockUsdtArtifact.bytecode, [])
    console.log(`        ✓ MockUSDT: ${mockUsdtAddr}`)

    // ── 3. Deploy DukerRegistryMock (implementation) ─────────
    console.log('  [3/5] Deploying DukerRegistry implementation...')
    const registryArtifact = loadArtifact('artifacts/contracts/mocks/MyONFT721Mock.sol/DukerRegistryMock.json')
    const implAddr = await deploy(registryArtifact.abi, registryArtifact.bytecode, [endpointAddr])
    console.log(`        ✓ Implementation: ${implAddr}`)

    // ── 4. Deploy ERC1967Proxy + initialize ──────────────────
    console.log('  [4/5] Deploying ERC1967Proxy + initialize...')
    const proxyArtifact = loadNodeModulesArtifact(
        'node_modules/.pnpm/@openzeppelin+contracts@5.6.1/node_modules/@openzeppelin/contracts/build/contracts/ERC1967Proxy.json'
    )

    // Encode initialize() calldata
    const initData = encodeFunctionData({
        abi: registryArtifact.abi,
        functionName: 'initialize',
        args: [
            'Duker Naming System',   // name
            'DUKER',                 // symbol
            ANVIL_ACCOUNT.address,   // delegate/owner
            LOCAL_CHAIN_EID,         // localChainEid
            ANVIL_ACCOUNT.address,   // dukigenRegistry (use account as dummy for now)
        ],
    })

    const proxyAddr = await deploy(proxyArtifact.abi, proxyArtifact.bytecode, [implAddr, initData])
    console.log(`        ✓ Proxy (DukerRegistry): ${proxyAddr}`)

    // ── 5. Set selfAgentId ───────────────────────────────────
    console.log('  [5/5] Setting selfAgentId = 1...')
    const txHash = await walletClient.writeContract({
        address: proxyAddr,
        abi: registryArtifact.abi,
        functionName: 'setSelfAgentId',
        args: [1n],
    })
    await publicClient.waitForTransactionReceipt({ hash: txHash })
    console.log(`        ✓ selfAgentId set`)

    // ── Output ───────────────────────────────────────────────
    const result = {
        chainEid: LOCAL_CHAIN_EID,
        rpcUrl: RPC_URL,
        endpointV2Mock: endpointAddr,
        dukerRegistry: proxyAddr,
        dukerRegistryImpl: implAddr,
        mockUsdt: mockUsdtAddr,
        deployer: ANVIL_ACCOUNT.address,
        deployerPrivateKey: ANVIL_PRIVATE_KEY,
    }

    const outPath = resolve(__dirname, '.deploy-local.json')
    writeFileSync(outPath, JSON.stringify(result, null, 2))

    console.log(`\n✅ Deployed! Addresses saved to: scripts/.deploy-local.json`)
    console.log(`\n  DukerRegistry (proxy): ${proxyAddr}`)
    console.log(`  MockUSDT:              ${mockUsdtAddr}`)
    console.log(`  EndpointV2Mock:        ${endpointAddr}`)

    console.log(`\n📋 Next steps:`)
    console.log(`  1. Update worker config.ts with: dukerRegistryAddress: '${proxyAddr}'`)
    console.log(`  2. Start worker:   npx wrangler dev --local`)
    console.log(`  3. Apply schema:   npx wrangler d1 execute duker_registry --local --file=./schemas/001_duker_registry.sql`)
    console.log(`  4. Run e2e test:   npx tsx scripts/test-e2e.ts`)
}

main().catch((err) => {
    console.error('❌ Deploy failed:', err)
    process.exit(1)
})
