#!/usr/bin/env tsx
/**
 * test-e2e-dukigen-sync.ts — End-to-end test of BlockchainSyncService SyncEvents.
 *
 * Prereqs:
 *   - anvil running, ALM stack deployed, worker running, D1 schema applied
 *
 * Usage: npx tsx scripts/test-e2e-dukigen-sync.ts
 */

import { createWalletClient, createPublicClient, http, parseAbi, toHex, type Hex } from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { foundry } from 'viem/chains'
import { getAlmDeployment } from 'contract-duki-alm-world/deployments'

const CHAIN_EID = 31337
const WORKER_URL = 'http://localhost:8788'

const deploy = getAlmDeployment(CHAIN_EID)

const AGENT_OWNER_KEY: Hex = generatePrivateKey()
const agentOwner = privateKeyToAccount(AGENT_OWNER_KEY)

const walletClient = createWalletClient({ account: agentOwner, chain: foundry, transport: http(deploy.rpcUrl!) })
const publicClient = createPublicClient({ chain: foundry, transport: http(deploy.rpcUrl!) })

const DUKIGEN_ABI = parseAbi([
    'function register(string agentName,string agentURI,string agentURIHash,string website,uint16 approxBps,uint8 productType,uint8 dukiType,string pledgeUrl)',
    'function eventState() view returns (uint64 evtSeq, uint64[4] checkpoints)',
])

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const ZERO_TOPIC = '0x0000000000000000000000000000000000000000000000000000000000000000'

async function fundAgentOwner() {
    const resp = await fetch(deploy.rpcUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'anvil_setBalance',
            params: [agentOwner.address, toHex(10n ** 19n)],
        }),
    })
    if (!resp.ok) throw new Error(`anvil_setBalance failed: ${resp.status}`)
}

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

function mintedAgentIdFromReceipt(receipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>>): bigint {
    const transferLog = receipt.logs.find(log =>
        log.address.toLowerCase() === deploy.dukigenRegistry.toLowerCase()
        && log.topics[0] === TRANSFER_TOPIC
        && log.topics[1] === ZERO_TOPIC
        && !!log.topics[3]
    )
    if (!transferLog?.topics[3]) throw new Error('Could not find ERC721 mint Transfer log')
    return BigInt(transferLog.topics[3])
}

const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`
const agentName = `DukigenSync${suffix}`
const agentURI = `ipfs://bafydukigen${suffix}/agent.json`
const agentURIHash = `bafydukigen${suffix}`
const website = `https://dukigen-sync.example/${suffix}`
const pledgeUrl = `https://dukigen-sync.example/${suffix}/pledge`

async function main() {
    console.log('BlockchainSyncService SyncEvents(DUKIGEN_REGISTRY) E2E test\n')
    console.log(`  chainEid:          ${CHAIN_EID}`)
    console.log(`  dukigenRegistry:   ${deploy.dukigenRegistry}`)
    console.log(`  worker:            ${WORKER_URL}`)
    console.log(`  agentOwner:        ${agentOwner.address}`)
    console.log(`  agentName:         ${agentName}\n`)

    console.log('[1/5] Worker health check + fund agent owner')
    const health = await fetch(`${WORKER_URL}/`).then(r => r.json()) as any
    assert(health?.ok === true, `worker is up (${health?.service})`)
    await fundAgentOwner()
    console.log('  funded agent owner with 10 ETH')

    console.log('\n[2/5] Read pre-register contract evt_seq')
    const [preSeq] = await publicClient.readContract({
        address: deploy.dukigenRegistry,
        abi: DUKIGEN_ABI,
        functionName: 'eventState',
    }) as readonly [bigint, readonly bigint[]]
    console.log(`  pre-register chainEvtSeq = ${preSeq}`)

    console.log('\n[3/5] Register Dukigen agent on-chain')
    const tx = await walletClient.writeContract({
        address: deploy.dukigenRegistry,
        abi: DUKIGEN_ABI,
        functionName: 'register',
        args: [agentName, agentURI, agentURIHash, website, 5000, 1, 1, pledgeUrl],
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    assert(receipt.status === 'success', `register tx ${tx} mined in block ${receipt.blockNumber}`)
    const agentId = mintedAgentIdFromReceipt(receipt)
    console.log(`  minted agentId = ${agentId}`)

    const [postSeq] = await publicClient.readContract({
        address: deploy.dukigenRegistry,
        abi: DUKIGEN_ABI,
        functionName: 'eventState',
    }) as readonly [bigint, readonly bigint[]]
    console.log(`  post-register chainEvtSeq = ${postSeq}`)
    assert(postSeq > preSeq, `chainEvtSeq advanced (${preSeq} -> ${postSeq})`)

    console.log('\n[4/5] Call SyncEvents(DUKIGEN_REGISTRY)')
    const syncResp = await workerPost('/dukiregistry.BlockchainSyncService/SyncEvents', {
        contract: 'DUKIGEN_REGISTRY',
        chainEid: CHAIN_EID,
        contractHead: postSeq.toString(),
    })
    console.log('  ', JSON.stringify(syncResp))
    assert(BigInt(syncResp.lastEvtSeq ?? '0') >= postSeq,
        `lastEvtSeq=${syncResp.lastEvtSeq} reached contract evtSeq=${postSeq}`)
    assert((syncResp.eventsIndexed ?? 0) >= 1, `eventsIndexed=${syncResp.eventsIndexed}`)

    console.log('\n[5/5] Query GetAgent')
    const getResp = await workerPost('/dukiregistry.DukigenRegistryService/GetAgent', {
        agentId: agentId.toString(),
    })
    console.log('  ', JSON.stringify(getResp))
    assert(getResp?.name === agentName, `GetAgent returned name "${getResp?.name}"`)
    assert(getResp?.agentUri === agentURI, `agentUri matches "${getResp?.agentUri}"`)
    assert(getResp?.agentUriHash === agentURIHash, `agentUriHash matches "${getResp?.agentUriHash}"`)
    assert(getResp?.website === website, `website matches "${getResp?.website}"`)
    assert(getResp?.pledgeUrl === pledgeUrl, `pledgeUrl matches "${getResp?.pledgeUrl}"`)
    assert(Number(getResp?.approxBps ?? 0) === 5000, `approxBps=${getResp?.approxBps}`)

    console.log('\nAll Dukigen sync e2e checks passed.')
}

main().catch((err) => {
    console.error('\nTest failed:', err)
    process.exit(1)
})
