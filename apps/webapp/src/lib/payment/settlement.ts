/**
 * payment-settlement.ts — Unified payment verify + settle dispatcher.
 *
 * Routes to the correct handler based on PaymentScheme:
 *   - X402   → x402-payment.ts (OKX Facilitator)
 *   - PERMIT → permit-payment.ts (operator mock + permit)
 *   - absent → mock only (dev)
 */

import { PaymentScheme, type PaymentData } from '@repo/apidefs'
import { x402Verify, x402Settle, type SettleResult } from './x402-payment'
import { permitSettle } from './permit-payment'
import { getDukerChainClients } from '../duker-chain'
import { mockUsdtAbi } from '@alm/dukernews-dao-contract'

// Re-export for consumers
export type { PaymentData, SettleResult }

// ─── Phase 1: Verify (no money moves) ───────────────────────────────────────

export async function verifyPayment(params: {
    paymentData?: PaymentData
    userAddress: string
    amountMicro: bigint
    description?: string
}): Promise<{ payer: string; isReal: boolean }> {
    const { paymentData, userAddress, amountMicro, description } = params

    if (paymentData?.scheme === PaymentScheme.X402) {
        const { payer } = await x402Verify({ paymentData, amountMicro, description })
        return { payer, isReal: true }
    }

    // PERMIT and dev/absent — skip verification (operator controls settlement)
    return { payer: userAddress, isReal: false }
}

// ─── Phase 2: Settle (money moves) ─────────────────────────────────────────

export async function settlePayment(params: {
    paymentData?: PaymentData
    userAddress: string
    amountMicro: bigint
    settleTarget?: 'contract' | 'user'
    description?: string
}): Promise<SettleResult> {
    const { paymentData, userAddress, amountMicro, settleTarget = 'contract', description } = params

    if (amountMicro === 0n) {
        return { settleTxHash: '0x0', payer: userAddress }
    }

    // ── X402: OKX Facilitator settles ────────────────────────────────────────
    if (paymentData?.scheme === PaymentScheme.X402) {
        return x402Settle({ paymentData, amountMicro, description })
    }

    // ── PERMIT: mock mint + permit submission ───────────────────────────────
    if (paymentData?.scheme === PaymentScheme.PERMIT) {
        return permitSettle({ paymentData, userAddress, amountMicro, settleTarget })
    }

    // ── Dev/mock: just mint (no signature) ──────────────────────────────────
    const { addrs, publicClient, walletClient, viemChain, chainId } = getDukerChainClients()
    const { getDefaultStablecoin } = await import('../contracts')
    const stablecoin = getDefaultStablecoin(chainId)

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
    console.log(`[mock] Settled: mintHash=${mintHash} amount=${amountMicro} to=${settleTarget}`)

    return { settleTxHash: mintHash, payer: userAddress }
}
