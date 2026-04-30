/**
 * seed-local.ts — Seed two Anvil accounts with usernames, dukigen agents, and posts.
 *
 * Run after `make deploy-local` to populate a fresh local environment:
 *   npx tsx scripts/seed-local.ts
 *
 * Env vars (all optional, defaults shown):
 *   DUKER_RPC=http://127.0.0.1:8545
 *   DUKER_API=http://localhost:3000/rpc        (TxService — dukernews webapp)
 *   REGISTRY_API=http://localhost:8788         (BlockchainSyncService — registry worker)
 */

import { createPublicClient, createWalletClient, http, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'
import { create, toBinary } from '@bufbuild/protobuf'
import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { daoDeployments } from '@alm/dukernews-dao-contract/deployments'
import { almDeployments } from 'contract-duki-alm-world/deployments'
import { dukerNewsAbi } from '@alm/dukernews-dao-contract'
import { dukerRegistryAbi, dukigenRegistryAbi } from 'contract-duki-alm-world'
import {
    TxService,
    EventDataSchema,
    PostCreatedPayloadSchema,
    PbPostDataSchema,
    WorksPostDataSchema,
    PostKind,
    deflateRaw,
} from '@repo/dukernews-apidefs'
import {
    BlockchainSyncService,
    ContractType,
    DukiType,
    ProductType,
} from '@repo/dukiregistry-apidefs'

// ── Config ────────────────────────────────────────────────────────────────

const RPC_URL = process.env.DUKER_RPC ?? 'http://127.0.0.1:8545'
const DUKER_API = process.env.DUKER_API ?? 'http://localhost:3000/rpc'
const REGISTRY_API = process.env.REGISTRY_API ?? 'http://localhost:8788'

const CHAIN_EID = 31337
const MINT_AMOUNT = 1_000_000n  // 1 USDT (6 decimals)

// Default Anvil accounts (deterministic from `test test test ... junk` mnemonic)
const SEED_ACCOUNTS = [
    {
        privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`,
        username: 'alice',
        dukigens: [
            { name: 'Alice Open Source Kit', uri: 'https://alice.example.com/agent1' },
            { name: 'Alice Dev Tools', uri: 'https://alice.example.com/agent2' },
        ],
        post: {
            title: 'Alice\'s first post — open-source dev toolkit for Web3',
            url: 'https://alice.example.com',
            text: 'Excited to share our new toolkit. Built with love for the DUKI community!',
        },
    },
    {
        privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as `0x${string}`,
        username: 'bob',
        dukigens: [
            { name: 'Bob DeFi Analytics', uri: 'https://bob.example.com/agent1' },
        ],
        post: {
            title: 'Bob\'s DeFi analytics dashboard — now live on DUKI',
            url: 'https://bob.example.com',
            text: 'Track on-chain metrics, credibility scores, and deal flows in real time.',
        },
    },
] as const

// Minimal ERC-20 ABI for approve
const ERC20_APPROVE_ABI = [
    {
        type: 'function',
        name: 'approve',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'nonpayable',
    },
] as const

// ── Clients — both use Connect JSON (useBinaryFormat: false) ─────────────

const publicClient = createPublicClient({ chain: foundry, transport: http(RPC_URL) })

// TxService on the dukernews webapp (localhost:3000/rpc)
const txClient = createClient(
    TxService,
    createConnectTransport({ baseUrl: DUKER_API, useBinaryFormat: false }),
)

// BlockchainSyncService on the registry worker (localhost:8788)
const syncClient = createClient(
    BlockchainSyncService,
    createConnectTransport({ baseUrl: REGISTRY_API, useBinaryFormat: false }),
)

// ── Helpers ───────────────────────────────────────────────────────────────

async function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/** Notify the dukernews webapp TxService — retries up to 4×. */
async function notifyDukerNews(txHash: `0x${string}`, dukiBps = 0) {
    for (let i = 0; i < 4; i++) {
        try {
            await txClient.notifyTx({ txHash, dukiBps })
            return
        } catch (err) {
            if (i < 3) await wait(1000 * (i + 1))
            else console.warn('  ⚠️  notifyTx(webapp) failed:', (err as Error).message)
        }
    }
}

/** Notify the registry worker BlockchainSyncService. */
async function notifyRegistry(txHash: `0x${string}`, contract: ContractType) {
    try {
        await syncClient.notifyTx({ contract, txHash, chainEid: CHAIN_EID })
    } catch (err) {
        console.warn(`  ⚠️  notifyTx(registry/${ContractType[contract]}) failed:`, (err as Error).message)
    }
}

function extractMintedAgentId(logs: any[]): bigint | null {
    // ERC721 Transfer(from=0x0, to, tokenId): topics[0]=sig, topics[1]=from, topics[3]=tokenId
    const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
    const ZERO_PAD = '0x0000000000000000000000000000000000000000000000000000000000000000'
    const log = logs.find(
        (l: any) => l.topics?.[0] === TRANSFER_TOPIC && l.topics?.[1] === ZERO_PAD && l.topics?.[3]
    )
    return log?.topics?.[3] ? BigInt(log.topics[3]) : null
}

async function buildPostHex(title: string, url: string, text: string): Promise<`0x${string}`> {
    let domain = ''
    try { if (url) domain = new URL(url).hostname } catch { /* ignore */ }

    const eventData = create(EventDataSchema, {
        payload: {
            case: 'postCreated',
            value: create(PostCreatedPayloadSchema, {
                title,
                url: url || undefined,
                text: text || undefined,
                kind: PostKind.WORKS,
                locale: 'en',
                domain,
                postData: create(PbPostDataSchema, {
                    payload: {
                        case: 'works',
                        value: create(WorksPostDataSchema, {
                            dukiType: DukiType.DUKI_TYPE_UNSPECIFIED,
                            approxBps: 0,
                            pledgeUrl: '',
                            productType: ProductType.PRODUCT_TYPE_UNSPECIFIED,
                            keyword: 'seed',
                        }),
                    },
                }),
                boostAmount: 0n,
            }),
        },
    })

    const compressed = await deflateRaw(toBinary(EventDataSchema, eventData))
    return toHex(compressed)
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
    const dao = daoDeployments[31337]
    const alm = almDeployments[31337]

    if (!dao || !alm) {
        console.error('❌ No local (chain 31337) deployment found — run `make deploy-local` first')
        process.exit(1)
    }

    const mockUsdt = (dao.mockUsdt ?? dao.stablecoin) as `0x${string}`

    console.log('🌱 Seeding local environment\n')
    console.log(`  DukerNews:        ${dao.dukerNews}`)
    console.log(`  DukerRegistry:    ${alm.dukerRegistry}`)
    console.log(`  DukigenRegistry:  ${alm.dukigenRegistry}`)
    console.log(`  MockUSDT:         ${mockUsdt}`)
    console.log(`  MintAmount:       ${MINT_AMOUNT} micro-USDT (${Number(MINT_AMOUNT) / 1e6} USDT)\n`)

    for (const acct of SEED_ACCOUNTS) {
        const account = privateKeyToAccount(acct.privateKey)
        const walletClient = createWalletClient({ account, chain: foundry, transport: http(RPC_URL) })

        console.log(`\n── ${acct.username} (${account.address}) ──────────────────────`)

        // ── 1. Approve + Mint username ────────────────────────────────
        console.log(`  [1/3] Minting username "${acct.username}" (${Number(MINT_AMOUNT) / 1e6} USDT)…`)

        // Approve DukerRegistry to pull the mint fee directly from the user.
        // DukerRegistry.mintUsernameTo uses safeTransferFrom(msg.sender, ...) so the
        // user must be msg.sender — we call DukerRegistry directly (not via DukerNews).
        const approveTx = await walletClient.writeContract({
            address: mockUsdt,
            abi: ERC20_APPROVE_ABI,
            functionName: 'approve',
            args: [alm.dukerRegistry, MINT_AMOUNT],
        })
        await publicClient.waitForTransactionReceipt({ hash: approveTx })
        console.log(`        ✅ approved DukerRegistry for ${Number(MINT_AMOUNT) / 1e6} USDT`)

        const mintTx = await walletClient.writeContract({
            address: alm.dukerRegistry,
            abi: dukerRegistryAbi,
            functionName: 'mintUsernameTo',
            args: [account.address, acct.username, MINT_AMOUNT, mockUsdt, 0n],
        })
        await publicClient.waitForTransactionReceipt({ hash: mintTx })
        console.log(`        ✅ tx: ${mintTx}`)

        // Notify both: registry worker indexes the identity, webapp indexes the event
        await notifyRegistry(mintTx, ContractType.DUKER_REGISTRY)
        console.log(`        📡 registry worker notified (DUKER_REGISTRY)`)
        await notifyDukerNews(mintTx)
        console.log(`        📡 webapp notified (TxService.NotifyTx)`)

        // ── 2. Register dukigen agents ────────────────────────────────
        console.log(`  [2/3] Registering ${acct.dukigens.length} dukigen agent(s)…`)
        for (const dukigen of acct.dukigens) {
            const registerTx = await walletClient.writeContract({
                address: alm.dukigenRegistry,
                abi: dukigenRegistryAbi,
                functionName: 'register',
                args: [dukigen.name, dukigen.uri],
            })
            const receipt = await publicClient.waitForTransactionReceipt({ hash: registerTx })
            const agentId = extractMintedAgentId(receipt.logs)
            console.log(`        ✅ "${dukigen.name}" → agentId ${agentId ?? '?'} | tx: ${registerTx}`)

            // Notify both: registry worker indexes the agent, webapp fetches events
            await notifyRegistry(registerTx, ContractType.DUKIGEN_REGISTRY)
            console.log(`        📡 registry worker notified (DUKIGEN_REGISTRY)`)
            await notifyDukerNews(registerTx)
            console.log(`        📡 webapp notified (TxService.NotifyTx)`)
        }

        // ── 3. Submit post ────────────────────────────────────────────
        console.log(`  [3/3] Submitting post "${acct.post.title.slice(0, 50)}…"`)
        const hexData = await buildPostHex(acct.post.title, acct.post.url, acct.post.text)

        const postTx = await walletClient.writeContract({
            address: dao.dukerNews,
            abi: dukerNewsAbi,
            functionName: 'submitPost',
            args: [
                2,        // AGG_TYPE_POST
                0n,       // aggId (new post)
                1,        // EVT_TYPE_POST_CREATED
                hexData,
                0n,       // boostAmount (free)
                mockUsdt,
            ],
        })
        await publicClient.waitForTransactionReceipt({ hash: postTx })
        console.log(`        ✅ tx: ${postTx}`)

        await notifyDukerNews(postTx)
        console.log(`        📡 webapp notified (TxService.NotifyTx)`)
    }

    console.log('\n✨ Seed complete!')
    console.log('   http://localhost:3000/newest  — posts')
    console.log('   http://localhost:3000/market  — dukigen agents\n')
}

main().catch(err => {
    console.error('❌ Fatal:', err)
    process.exit(1)
})
