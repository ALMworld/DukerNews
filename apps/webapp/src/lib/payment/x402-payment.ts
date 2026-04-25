/**
 * x402-payment.ts — OKX x402 protocol (EIP-3009 TransferWithAuthorization).
 *
 * OKX Facilitator verifies and settles the payment; gas paid by OKX.
 * Used on X Layer (chainId=196) or when OKX_SETTLE=true.
 */

import { getDukerChain } from '../duker-chain'
import {
    okxVerify,
    okxSettle,
    buildPaymentRequirements,
    type OkxPaymentPayload,
} from '../../services/okx402-service'
import type { PaymentData } from '@repo/dukernews-apidefs'

export interface SettleResult {
    settleTxHash: string
    payer: string
}

// ─── Convert proto X402Payment → OKX API format ─────────────────────────────

export function toOkxPayload(pd: PaymentData): OkxPaymentPayload | null {
    if (pd.payload?.case !== 'x402') return null
    const x402 = pd.payload.value
    const auth = x402.authorization
    if (!auth) return null

    return {
        x402Version: x402.x402Version,
        scheme: (x402.scheme || 'exact') as 'exact',
        payload: {
            signature: x402.signature,
            authorization: {
                from: auth.from,
                to: auth.to,
                value: auth.value,
                validAfter: auth.validAfter,
                validBefore: auth.validBefore,
                nonce: auth.nonce,
            },
        },
    }
}

// ─── Verify (no money moves) ────────────────────────────────────────────────

export async function x402Verify(params: {
    paymentData: PaymentData
    amountMicro: bigint
    description?: string
}): Promise<{ payer: string }> {
    const { paymentData, amountMicro, description } = params
    const { addrs } = getDukerChain()

    const okxPayload = toOkxPayload(paymentData)
    if (!okxPayload) throw new Error('Invalid x402 payload')

    const paymentRequirements = buildPaymentRequirements({
        payTo: addrs.DukerNews,
        amountMicro,
        description: description ?? 'DukerNews payment',
    })

    const result = await okxVerify(okxPayload, paymentRequirements)
    if (!result.isValid) {
        throw new Error(`OKX verify failed: ${result.invalidReason}`)
    }
    console.log(`[x402] Verified: payer=${result.payer}`)
    return { payer: result.payer }
}

// ─── Settle (money moves via OKX Facilitator) ──────────────────────────────

export async function x402Settle(params: {
    paymentData: PaymentData
    amountMicro: bigint
    description?: string
}): Promise<SettleResult> {
    const { paymentData, amountMicro, description } = params
    const { addrs } = getDukerChain()

    const okxPayload = toOkxPayload(paymentData)
    if (!okxPayload) throw new Error('Invalid x402 payload for settle')

    const paymentRequirements = buildPaymentRequirements({
        payTo: addrs.DukerNews,
        amountMicro,
        description: description ?? 'DukerNews payment',
    })

    const result = await okxSettle(okxPayload, paymentRequirements)
    console.log(`[x402] OKX settled: payer=${result.payer} txHash=${result.txHash}`)
    return { settleTxHash: result.txHash, payer: result.payer }
}
