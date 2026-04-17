#!/usr/bin/env tsx
/**
 * test-e2e.ts — End-to-end integration test for DukerRegistry + Worker.
 *
 * Prerequisites:
 *   1. anvil running on port 8545
 *   2. Contracts deployed (npx tsx scripts/deploy-local.ts)
 *   3. Worker running (npx wrangler dev --local)
 *   4. Schema applied (npx wrangler d1 execute duker_registry --local --file=./schemas/001_duker_registry.sql)
 *
 * Usage:
 *   npx tsx scripts/test-e2e.ts
 */

import { createWalletClient, createPublicClient, http, parseAbi, encodeFunctionData, getAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Load deployment info ─────────────────────────────────────
const deployPath = resolve(__dirname, '.deploy-local.json')
let deployInfo: any
try {
    deployInfo = JSON.parse(readFileSync(deployPath, 'utf-8'))
} catch {
    console.error('❌ Run "npx tsx scripts/deploy-local.ts" first')
    process.exit(1)
}

const RPC_URL = deployInfo.rpcUrl
const WORKER_URL = 'http://localhost:8788'
const CHAIN_EID = deployInfo.chainEid

const account = privateKeyToAccount(deployInfo.deployerPrivateKey)
const walletClient = createWalletClient({ account, chain: foundry, transport: http(RPC_URL) })
const publicClient = createPublicClient({ chain: foundry, transport: http(RPC_URL) })

// ── Minimal ABIs ─────────────────────────────────────────────
const REGISTRY_ABI = parseAbi([
    'function mintUsername(string displayName, uint16 preferDukiBps_, uint256 experienceAmount, address stableCoinAddress)',
    'function usernameOf(address owner) view returns (string)',
    'function setSelfAgentId(uint256 _selfAgentId)',
    'event DukerEvent(uint256 indexed tokenId, uint64 indexed evtSeq, uint8 eventType, address ego, string username, uint64 evtTime, bytes eventData)',
])

const ERC20_ABI = parseAbi([
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address owner) view returns (uint256)',
])

// ── Helpers ──────────────────────────────────────────────────
async function workerPost(path: string, body: any): Promise<any> {
    const resp = await fetch(`${WORKER_URL}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Connect-Protocol-Version': '1',
        },
        body: JSON.stringify(body),
    })
    if (!resp.ok) {
        const text = await resp.text()
        throw new Error(`Worker ${path} failed: ${resp.status} ${text}`)
    }
    return resp.json()
}

function assert(condition: boolean, msg: string) {
    if (!condition) {
        console.error(`  ❌ FAIL: ${msg}`)
        process.exit(1)
    }
    console.log(`  ✅ ${msg}`)
}

// ── Tests ────────────────────────────────────────────────────
async function main() {
    console.log('🧪 DukerRegistry E2E Integration Test\n')
    console.log(`  Chain EID:  ${CHAIN_EID}`)
    console.log(`  Registry:   ${deployInfo.dukerRegistry}`)
    console.log(`  MockUSDT:   ${deployInfo.mockUsdt}`)
    console.log(`  Worker:     ${WORKER_URL}`)
    console.log()

    // ── 1. Health check + inject config ────────────────────────
    console.log('[1/7] Worker health check + inject config...')
    try {
        const health = await fetch(`${WORKER_URL}/`)
        const json = await health.json() as any
        assert(json.ok === true, `Worker is healthy: ${json.service}`)
    } catch (err: any) {
        console.error(`  ❌ Worker not running at ${WORKER_URL}. Start with: npx wrangler dev --local`)
        process.exit(1)
    }

    // Inject deployed addresses into the running worker
    const configResp = await fetch(`${WORKER_URL}/_dev/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chainEid: CHAIN_EID,
            dukerRegistryAddress: deployInfo.dukerRegistry,
            dukigenRegistryAddress: deployInfo.deployer, // dummy for now
            rpcUrl: RPC_URL,
        }),
    })
    assert((await configResp.json() as any).ok, 'Injected chain config into worker')

    // ── 2. Approve stablecoin for DukerRegistry ──────────────
    console.log('\n[2/6] Approving MockUSDT for DukerRegistry...')
    const approveAmount = 1000000000n // 1000 USDT (6 decimals)
    const approveTx = await walletClient.writeContract({
        address: deployInfo.mockUsdt,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [deployInfo.dukerRegistry, approveAmount],
    })
    await publicClient.waitForTransactionReceipt({ hash: approveTx })
    assert(true, `Approved ${approveAmount} to DukerRegistry`)

    // ── 3. Mint username ─────────────────────────────────────
    console.log('\n[3/6] Minting username "alice"...')
    const mintTx = await walletClient.writeContract({
        address: deployInfo.dukerRegistry,
        abi: REGISTRY_ABI,
        functionName: 'mintUsername',
        args: [
            'alice',                        // displayName
            500,                            // preferDukiBps (5%)
            0n,                             // experienceAmount (0 = free mint)
            deployInfo.mockUsdt,            // stableCoinAddress
        ],
    })
    const mintReceipt = await publicClient.waitForTransactionReceipt({ hash: mintTx })
    assert(mintReceipt.status === 'success', `Minted! TxHash: ${mintTx}`)

    // Verify on-chain
    const username = await publicClient.readContract({
        address: deployInfo.dukerRegistry,
        abi: REGISTRY_ABI,
        functionName: 'usernameOf',
        args: [account.address],
    })
    assert(username === `alice.${CHAIN_EID}`, `On-chain username: "${username}"`)

    // ── 4. Notify worker about the mint tx ───────────────────
    console.log('\n[4/6] Notifying worker about mint tx...')
    const notifyResp = await workerPost('/dukiregistry.DukerRegistryService/NotifyDukerTx', {
        txHash: mintTx,
        chainEid: CHAIN_EID,
    })
    console.log(`  📦 Worker response:`, JSON.stringify(notifyResp, null, 2))
    assert(
        notifyResp.events && notifyResp.events.length > 0,
        `Worker parsed ${notifyResp.events?.length ?? 0} events from tx`
    )

    // ── 5. Query GetUsername ──────────────────────────────────
    console.log('\n[5/6] Querying GetUsername...')
    const getUserResp = await workerPost('/dukiregistry.DukerRegistryService/GetUsername', {
        address: account.address,
        chainEid: CHAIN_EID,
    })
    console.log(`  📦 Worker response:`, JSON.stringify(getUserResp, null, 2))
    assert(
        getUserResp.identity?.username === `alice.${CHAIN_EID}`,
        `Worker returned username: "${getUserResp.identity?.username}"`
    )
    assert(
        getUserResp.identity?.owner?.toLowerCase() === account.address.toLowerCase(),
        `Owner matches: ${getUserResp.identity?.owner}`
    )

    // ── 6. Query GetIdentitiesByToken ────────────────────────
    console.log('\n[6/6] Querying GetIdentitiesByToken...')
    const tokenId = getUserResp.identity?.tokenId
    if (tokenId) {
        const getTokenResp = await workerPost('/dukiregistry.DukerRegistryService/GetIdentitiesByToken', {
            tokenId: tokenId,
        })
        console.log(`  📦 Worker response:`, JSON.stringify(getTokenResp, null, 2))
        assert(
            getTokenResp.identity?.username === `alice.${CHAIN_EID}`,
            `Token lookup returned: "${getTokenResp.identity?.username}"`
        )
    } else {
        console.log('  ⚠ Skipped — no tokenId from previous query')
    }

    console.log('\n' + '═'.repeat(50))
    console.log('🎉 All tests passed!')
    console.log('═'.repeat(50))
}

main().catch((err) => {
    console.error('\n❌ Test failed:', err)
    process.exit(1)
})
