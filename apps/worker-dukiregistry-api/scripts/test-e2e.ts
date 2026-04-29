#!/usr/bin/env tsx
/**
 * test-e2e.ts — End-to-end integration test for DukerRegistry + Worker.
 *
 * Prerequisites:
 *   1. anvil running on port 8545
 *   2. ALM stack deployed (cd packages/contract_duki_alm_world && make deploy-local)
 *   3. Worker running (pnpm dev)
 *   4. Schema applied (pnpm test:schema)
 *
 * Usage:
 *   npx tsx scripts/test-e2e.ts
 */

import { createWalletClient, createPublicClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'
import { getAlmDeployment } from 'contract-duki-alm-world/deployments'

const CHAIN_EID = 31337
const WORKER_URL = 'http://localhost:8788'

// ── Load deployment addresses from canonical source ─────────
const deploy = getAlmDeployment(CHAIN_EID)
const ANVIL_DEPLOYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const

const account = privateKeyToAccount(ANVIL_DEPLOYER_KEY)
const walletClient = createWalletClient({ account, chain: foundry, transport: http(deploy.rpcUrl!) })
const publicClient = createPublicClient({ chain: foundry, transport: http(deploy.rpcUrl!) })

// ── Minimal ABIs ─────────────────────────────────────────────
const REGISTRY_ABI = parseAbi([
    'function mintUsername(string displayName)',
    'function usernameOf(address owner) view returns (string)',
    'event DukerEvent(uint256 indexed tokenId, uint64 indexed evtSeq, uint8 eventType, address ego, string username, uint64 evtTime, bytes eventData)',
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
    console.log(`  Chain EID:          ${CHAIN_EID}`)
    console.log(`  DukerRegistry:      ${deploy.dukerRegistry}`)
    console.log(`  DukigenRegistry:    ${deploy.dukigenRegistry}`)
    console.log(`  MockUSDT:           ${deploy.mockUsdt}`)
    console.log(`  Worker:             ${WORKER_URL}`)
    console.log()

    // ── 1. Health check ────────────────────────────────────────
    console.log('[1/7] Worker health check...')
    try {
        const health = await fetch(`${WORKER_URL}/`)
        const json = await health.json() as any
        assert(json.ok === true, `Worker is healthy: ${json.service}`)
    } catch (err: any) {
        console.error(`  ❌ Worker not running at ${WORKER_URL}. Start with: pnpm dev`)
        process.exit(1)
    }

    // ── 2. Mint username ─────────────────────────────────────
    console.log('\n[2/7] Minting username "alice"...')
    const mintTx = await walletClient.writeContract({
        address: deploy.dukerRegistry,
        abi: REGISTRY_ABI,
        functionName: 'mintUsername',
        args: [
            'alice',                        // displayName
        ],
    })
    const mintReceipt = await publicClient.waitForTransactionReceipt({ hash: mintTx })
    assert(mintReceipt.status === 'success', `Minted! TxHash: ${mintTx}`)

    // Verify on-chain
    const username = await publicClient.readContract({
        address: deploy.dukerRegistry,
        abi: REGISTRY_ABI,
        functionName: 'usernameOf',
        args: [account.address],
    })
    assert(username === `alice.${CHAIN_EID}`, `On-chain username: "${username}"`)

    // ── 4. Notify worker about the mint tx (DukerRegistry) ───
    console.log('\n[4/7] Notifying worker about mint tx (DukerRegistry)...')
    const notifyResp = await workerPost('/dukiregistry.BlockchainSyncService/NotifyTx', {
        contract: 'DUKER_REGISTRY',
        txHash: mintTx,
        chainEid: CHAIN_EID,
    })
    console.log(`  📦 Worker response:`, JSON.stringify(notifyResp, null, 2))
    assert(
        notifyResp.dukerEvents && notifyResp.dukerEvents.length > 0,
        `Worker parsed ${notifyResp.dukerEvents?.length ?? 0} DukerRegistry events from tx`
    )

    // ── 5. Notify worker about the same tx (DukigenRegistry) ─
    console.log('\n[5/7] Notifying worker about mint tx (DukigenRegistry)...')
    const notifyDukigenResp = await workerPost('/dukiregistry.BlockchainSyncService/NotifyTx', {
        contract: 'DUKIGEN_REGISTRY',
        txHash: mintTx,
        chainEid: CHAIN_EID,
    })
    console.log(`  📦 Worker response:`, JSON.stringify(notifyDukigenResp, null, 2))
    console.log(`  ✅ DukigenRegistry notify succeeded (${notifyDukigenResp.dukigenEvents?.length ?? 0} events)`)

    // ── 6. Query GetUsername ──────────────────────────────────
    console.log('\n[6/7] Querying GetUsername...')
    const getUserResp = await workerPost('/dukiregistry.DukerRegistryService/GetUsername', {
        address: account.address,
        chainEid: CHAIN_EID,
    })
    console.log(`  📦 Worker response:`, JSON.stringify(getUserResp, null, 2))
    const userIdentity = (getUserResp.identities ?? [])[0]
    assert(
        userIdentity?.username === `alice.${CHAIN_EID}`,
        `Worker returned username: "${userIdentity?.username}"`
    )
    assert(
        userIdentity?.ego?.toLowerCase() === account.address.toLowerCase(),
        `Ego matches: ${userIdentity?.ego}`
    )

    // ── 7. Query GetIdentitiesByToken ────────────────────────
    console.log('\n[7/7] Querying GetIdentitiesByToken...')
    const tokenId = userIdentity?.tokenId
    if (tokenId) {
        const getTokenResp = await workerPost('/dukiregistry.DukerRegistryService/GetIdentitiesByToken', {
            tokenId: tokenId,
        })
        console.log(`  📦 Worker response:`, JSON.stringify(getTokenResp, null, 2))
        const tokenIdentity = (getTokenResp.identities ?? [])[0]
        assert(
            tokenIdentity?.username === `alice.${CHAIN_EID}`,
            `Token lookup returned: "${tokenIdentity?.username}"`
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
