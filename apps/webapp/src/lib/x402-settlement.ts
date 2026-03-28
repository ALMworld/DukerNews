/**
 * x402-settlement.ts — Server-side x402 payment settlement helper.
 *
 * Logic:
 *   - CHAIN=xlayer + paymentPayload present → real OKX verify + settle
 *   - Permit present → user signed EIP-2612 permit; server submits permit() on-chain
 *   - Otherwise (local/Sepolia, no payload, no permit) → mock mint via deployer key
 *
 * For MINT flows: settle to CONTRACT (mintUsernameViaX402 uses transfer())
 * For BOOST/POST flows: settle to USER (contract uses transferFrom(user, ...))
 */

import { createPublicClient, createWalletClient, http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { getHomeChain } from './server-chain'
import { mockUsdtAbi } from '@alm/duker-dao-contract'
import {
    okxVerifyAndSettle,
    buildPaymentRequirements,
    type OkxPaymentPayload,
} from '../services/okx402-service'

// Deployer / operator key — Anvil fallback for local dev
const DEPLOYER_KEY = (process.env.OPERATOR_PRIVATE_KEY ||
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as `0x${string}`

// EIP-2612 permit ABI
const PERMIT_ABI = [
    {
        type: 'function',
        name: 'permit',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
            { name: 'v', type: 'uint8' },
            { name: 'r', type: 'bytes32' },
            { name: 's', type: 'bytes32' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'nonces',
        inputs: [{ name: 'owner', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
] as const

export interface SettleResult {
    /** Payment chain tx hash (OKX settlement or mock mint) */
    paymentTxHash: string
    /** Payer address (from OKX verify, or userAddress for mock) */
    payer: string
}

/**
 * Settle a payment: real OKX, EIP-2612 permit, or mock mint.
 *
 * @param amountMicro - Amount in token micro-units (e.g. 1_000_000 = 1 USDT)
 * @param userAddress - The user's wallet address
 * @param settleTarget - 'contract' | 'user' — where mock USDT is minted
 *                       'contract' for mint (contract does transfer())
 *                       'user' for boost/post (contract does transferFrom(user, ...))
 * @param permitSignature - 65-byte EIP-2612 permit signature from client
 * @param permitDeadline  - Permit expiry timestamp
 * @param permitValue     - Amount approved in permit
 * @param paymentPayload  - OKX EIP-3009 payload (production only)
 * @param description     - Human-readable description
 */
export async function settleX402Payment(params: {
    amountMicro: bigint
    userAddress: string
    settleTarget?: 'contract' | 'user'
    permitSignature?: Uint8Array
    permitDeadline?: bigint
    permitValue?: bigint
    paymentPayload?: OkxPaymentPayload
    description?: string
}): Promise<SettleResult> {
    const {
        amountMicro, userAddress, settleTarget = 'contract',
        permitSignature, permitDeadline, permitValue,
        paymentPayload, description,
    } = params

    // Skip settlement entirely for zero-amount (free) operations
    if (amountMicro === 0n) {
        return { paymentTxHash: '0x0', payer: userAddress }
    }

    const { addrs, viemChain, rpcUrl, chainId } = getHomeChain()
    const isXLayer = chainId === 196
    const forceOkx = process.env.OKX_SETTLE === 'true'
    const useRealOkx = (isXLayer || forceOkx) && !!paymentPayload

    // ── Real OKX settle ───────────────────────────────────────────────────────
    if (useRealOkx) {
        const paymentRequirements = buildPaymentRequirements({
            payTo: addrs.DukerNews,
            amountMicro,
            description: description ?? 'DukerNews payment',
        })
        const result = await okxVerifyAndSettle(paymentPayload!, paymentRequirements)
        console.log(`[x402] OKX settled: payer=${result.payer} txHash=${result.paymentTxHash}`)
        return result
    }

    // ── Mock/Permit settle (local/Sepolia dev) ───────────────────────────────
    const publicClient = createPublicClient({ chain: viemChain as any, transport: http(rpcUrl) })
    const operatorAccount = privateKeyToAccount(DEPLOYER_KEY)
    const walletClient = createWalletClient({
        account: operatorAccount,
        chain: viemChain as any,
        transport: http(rpcUrl),
    })

    const { getDefaultStablecoin } = await import('./contracts')
    const stablecoin = getDefaultStablecoin(chainId)

    // Determine where to mint mock USDT
    const mintTarget = settleTarget === 'user'
        ? userAddress as `0x${string}`
        : addrs.DukerNews

    // Mock mint USDT
    const mintHash = await walletClient.writeContract({
        chain: viemChain as any,
        address: stablecoin.address,
        abi: mockUsdtAbi,
        functionName: 'mint',
        args: [mintTarget, amountMicro],
    })
    await publicClient.waitForTransactionReceipt({ hash: mintHash })
    console.log(`[x402] Mock settled: mintHash=${mintHash} amount=${amountMicro} to=${settleTarget}`)

    // ── Submit EIP-2612 permit if provided ────────────────────────────────────
    // This grants DukerNews contract approval to transferFrom(user, ...)
    if (permitSignature && permitSignature.length === 65 && permitDeadline && (permitValue !== undefined)) {
        const r = `0x${Buffer.from(permitSignature.slice(0, 32)).toString('hex')}` as Hex
        const s = `0x${Buffer.from(permitSignature.slice(32, 64)).toString('hex')}` as Hex
        const v = permitSignature[64]

        console.log(`[x402] Submitting permit: owner=${userAddress} spender=${addrs.DukerNews} value=${permitValue} deadline=${permitDeadline}`)

        const permitTx = await walletClient.writeContract({
            chain: viemChain as any,
            address: stablecoin.address,
            abi: PERMIT_ABI,
            functionName: 'permit',
            args: [
                userAddress as `0x${string}`,
                addrs.DukerNews,
                permitValue,
                permitDeadline,
                v,
                r,
                s,
            ],
        })
        await publicClient.waitForTransactionReceipt({ hash: permitTx })
        console.log(`[x402] Permit submitted: txHash=${permitTx}`)
    }

    return { paymentTxHash: mintHash, payer: userAddress }
}
