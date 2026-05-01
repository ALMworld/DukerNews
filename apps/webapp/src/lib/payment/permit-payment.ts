/**
 * permit-payment.ts — EIP-2612 permit settlement.
 *
 * User signs a gasless approve off-chain. Operator submits permit()
 * on-chain to set allowance, then calls transferFrom(). Gas paid by operator.
 *
 * Used on Sepolia/dev chains where OKX Facilitator is not available.
 */

import { getDukerChainClients } from '../duker-chain'
import { mockUsdtAbi } from '@alm/dukernews-dao-contract'
import type { PaymentData } from '@repo/dukernews-apidefs'
import type { SettleResult } from './x402-payment'

const PERMIT_ABI = [{
    type: 'function' as const, name: 'permit' as const,
    inputs: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
        { name: 'v', type: 'uint8' },
        { name: 'r', type: 'bytes32' },
        { name: 's', type: 'bytes32' },
    ],
    outputs: [], stateMutability: 'nonpayable' as const,
}] as const

/** Parse a 65-byte hex signature into r, s, v components. */
function splitSignature(sig: string): { r: `0x${string}`; s: `0x${string}`; v: number } {
    const hex = sig.startsWith('0x') ? sig.slice(2) : sig
    const bytes = new Uint8Array(65)
    for (let i = 0; i < 65; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    }
    const r = `0x${Array.from(bytes.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`
    const s = `0x${Array.from(bytes.slice(32, 64)).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`
    return { r, s, v: bytes[64] }
}

// ─── Settle: mock mint + permit submission ──────────────────────────────────

export async function permitSettle(params: {
    paymentData: PaymentData
    userAddress: string
    amountMicro: bigint
    settleTarget: 'contract' | 'user'
    chainEid?: number
}): Promise<SettleResult> {
    const { paymentData, userAddress, amountMicro, settleTarget, chainEid } = params
    const { addrs, publicClient, walletClient, viemChain, chainId } = getDukerChainClients(chainEid)
    const { getDefaultStablecoin } = await import('../contracts')
    const stablecoin = getDefaultStablecoin(chainId)

    // 1. Mock-mint USDT to target (dev/Sepolia only)
    const mintTarget = settleTarget === 'user'
        ? userAddress as `0x${string}`
        : addrs.DukerNews

    const mintHash = await walletClient.writeContract({
        chain: viemChain as any,
        address: stablecoin.address,
        abi: mockUsdtAbi,
        functionName: 'mint',
        args: [mintTarget, amountMicro],
    })
    await publicClient.waitForTransactionReceipt({ hash: mintHash })
    console.log(`[permit] Mock mint: ${mintHash} amount=${amountMicro} to=${settleTarget}`)

    // 2. Submit permit on-chain (if signature provided)
    if (paymentData.payload?.case === 'permit') {
        const permit = paymentData.payload.value
        const { r, s, v } = splitSignature(permit.signature)

        const permitTx = await walletClient.writeContract({
            chain: viemChain as any,
            address: stablecoin.address,
            abi: PERMIT_ABI,
            functionName: 'permit',
            args: [
                permit.owner as `0x${string}`,
                permit.spender as `0x${string}`,
                BigInt(permit.value),
                BigInt(permit.deadline),
                v, r, s,
            ],
        })
        await publicClient.waitForTransactionReceipt({ hash: permitTx })
        console.log(`[permit] Submitted: txHash=${permitTx}`)
    }

    return { settleTxHash: mintHash, payer: userAddress }
}
