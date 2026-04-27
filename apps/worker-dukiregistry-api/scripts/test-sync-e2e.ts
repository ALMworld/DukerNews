#!/usr/bin/env tsx
/**
 * test-sync-e2e.ts — End-to-end test of the SyncDukerEvents pull path.
 *
 * Unlike test-e2e.ts (which uses NotifyDukerTx — push by tx hash), this drives
 * the worker through the catch-up path:
 *
 *   1. Mint a username on anvil  → contract emits DukerEvent(evtSeq=N)
 *   2. Call SyncDukerEvents      → worker calls eventState(), getLogs, indexes
 *   3. Call GetUsername          → confirms duker_users row was materialized
 *
 * Prereqs (same as test-e2e.ts):
 *   - anvil running, ALM stack deployed, worker running, D1 schema applied
 *
 * Usage: npx tsx scripts/test-sync-e2e.ts
 */

import { createWalletClient, createPublicClient, http, parseAbi, toHex, type Hex } from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { foundry } from 'viem/chains'
import { getAlmDeployment } from 'contract-duki-alm-world/deployments'

const CHAIN_EID = 31337
const WORKER_URL = 'http://localhost:8788'

const deploy = getAlmDeployment(CHAIN_EID)

// Generate a fresh wallet each run — DukerRegistry only lets each address mint
// once, so reusing a key across runs would always revert on the second mint.
const ALICE_KEY: Hex = generatePrivateKey()
const alice = privateKeyToAccount(ALICE_KEY)

const walletClient = createWalletClient({ account: alice, chain: foundry, transport: http(deploy.rpcUrl!) })
const publicClient = createPublicClient({ chain: foundry, transport: http(deploy.rpcUrl!) })

async function fundAlice() {
    // anvil_setBalance — alice needs ETH to pay gas.
    const resp = await fetch(deploy.rpcUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0', id: 1,
            method: 'anvil_setBalance',
            params: [alice.address, toHex(10n ** 19n)],
        }),
    })
    if (!resp.ok) throw new Error(`anvil_setBalance failed: ${resp.status}`)
}

const REGISTRY_ABI = parseAbi([
    'function mintUsername(string displayName)',
    'function usernameOf(address owner) view returns (string)',
    'function eventState() view returns (uint64 evtSeq, uint64[4] checkpoints)',
])

async function workerPost(path: string, body: any): Promise<any> {
    const resp = await fetch(`${WORKER_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1' },
        body: JSON.stringify(body),
    })
    if (!resp.ok) {
        throw new Error(`Worker ${path} failed: ${resp.status} ${await resp.text()}`)
    }
    return resp.json()
}

function assert(cond: boolean, msg: string) {
    if (!cond) {
        console.error(`  FAIL: ${msg}`)
        process.exit(1)
    }
    console.log(`  OK   ${msg}`)
}

// Pick a username that's almost certainly unique per run (unix-seconds suffix).
const handle = `alice${Math.floor(Date.now() / 1000) % 100000}`

async function main() {
    console.log('SyncDukerEvents E2E test\n')
    console.log(`  chainEid:       ${CHAIN_EID}`)
    console.log(`  dukerRegistry:  ${deploy.dukerRegistry}`)
    console.log(`  worker:         ${WORKER_URL}`)
    console.log(`  alice:          ${alice.address}`)
    console.log(`  handle:         ${handle}\n`)

    // 1. Worker health + fund the fresh wallet
    console.log('[1/5] Worker health check + fund alice')
    const health = await fetch(`${WORKER_URL}/`).then(r => r.json()) as any
    assert(health?.ok === true, `worker is up (${health?.service})`)
    await fundAlice()
    console.log(`  funded alice with 10 ETH`)

    // 2. Read on-chain evtSeq before mint
    console.log('\n[2/5] Read pre-mint contract evt_seq')
    const [preSeq] = await publicClient.readContract({
        address: deploy.dukerRegistry,
        abi: REGISTRY_ABI,
        functionName: 'eventState',
    }) as readonly [bigint, readonly bigint[]]
    console.log(`  pre-mint chainEvtSeq = ${preSeq}`)

    // 3. Mint username
    console.log('\n[3/5] Mint username on-chain')
    const tx = await walletClient.writeContract({
        address: deploy.dukerRegistry,
        abi: REGISTRY_ABI,
        functionName: 'mintUsername',
        args: [handle],
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    assert(receipt.status === 'success', `mint tx ${tx} mined in block ${receipt.blockNumber}`)

    const onChainUsername = await publicClient.readContract({
        address: deploy.dukerRegistry,
        abi: REGISTRY_ABI,
        functionName: 'usernameOf',
        args: [alice.address],
    })
    assert(onChainUsername === `${handle}.${CHAIN_EID}`, `on-chain usernameOf -> "${onChainUsername}"`)

    const [postSeq] = await publicClient.readContract({
        address: deploy.dukerRegistry,
        abi: REGISTRY_ABI,
        functionName: 'eventState',
    }) as readonly [bigint, readonly bigint[]]
    console.log(`  post-mint chainEvtSeq = ${postSeq}`)
    assert(postSeq > preSeq, `chainEvtSeq advanced (${preSeq} -> ${postSeq})`)

    // 4. Drive the SYNC path — no tx hash given to the worker.
    //    Use a small max_block_range to exercise the chunked loop.
    console.log('\n[4/5] Call SyncDukerEvents (max_block_range=50)')
    const syncResp = await workerPost('/dukiregistry.DukerRegistryService/SyncDukerEvents', {
        chainEid: CHAIN_EID,
        lastEvtSeq: '0',
        maxBlockRange: '50',
    })
    console.log('  ', JSON.stringify(syncResp))
    assert(BigInt(syncResp.chainEvtSeq ?? '0') === postSeq,
        `worker reports chainEvtSeq=${syncResp.chainEvtSeq} (matches contract)`)
    assert(BigInt(syncResp.syncedUpTo ?? '0') >= postSeq,
        `syncedUpTo=${syncResp.syncedUpTo} reached chainEvtSeq=${postSeq}`)
    assert((syncResp.eventsIndexed ?? 0) >= 1, `eventsIndexed=${syncResp.eventsIndexed}`)

    // 5. Verify users table got the row via the sync path
    console.log('\n[5/5] Query GetUsername')
    const getResp = await workerPost('/dukiregistry.DukerRegistryService/GetUsername', {
        address: alice.address,
        chainEid: CHAIN_EID,
    })
    console.log('  ', JSON.stringify(getResp))
    const identity = (getResp?.identities ?? [])[0]
    assert(identity?.username === `${handle}.${CHAIN_EID}`,
        `GetUsername returned "${identity?.username}"`)
    assert(identity?.ego?.toLowerCase() === alice.address.toLowerCase(),
        `ego matches: ${identity?.ego}`)

    console.log('\nAll sync e2e checks passed.')
}

main().catch((err) => {
    console.error('\nTest failed:', err)
    process.exit(1)
})
