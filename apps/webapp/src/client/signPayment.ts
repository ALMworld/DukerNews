/**
 * signPayment.ts — Payment signature builders.
 *
 * Supports two payment schemes via PaymentData oneof:
 *   - x402 (EIP-3009 TransferWithAuthorization) — OKX Facilitator pays gas
 *   - permit (EIP-2612 Permit) — operator pays gas
 *
 * Default: x402. Change PAYMENT_SCHEME to switch.
 */

import { create } from '@bufbuild/protobuf'
import { PaymentDataSchema, PaymentScheme, type PaymentData } from '@repo/dukernews-apidefs'
import type { WalletClient, PublicClient } from 'viem'

export type PaymentSchemeType = 'x402' | 'permit'

/** Active payment scheme. Change this to switch globally. */
export const PAYMENT_SCHEME: PaymentSchemeType = 'x402'

export interface SignPaymentParams {
    walletClient: WalletClient
    publicClient: PublicClient
    address: `0x${string}`
    /** Token name (must match ERC20Permit/EIP-3009 domain name) */
    tokenName: string
    tokenAddress: `0x${string}`
    /** Payee address (DukerNews contract) */
    payTo: `0x${string}`
    /** Payment amount in micro-units */
    amount: bigint
    chainId: number
}

/**
 * Sign a payment authorization based on the active PAYMENT_SCHEME.
 * Returns a proto PaymentData ready to attach to DukerTxReq.
 */
export async function signPayment(params: SignPaymentParams): Promise<PaymentData> {
    if (PAYMENT_SCHEME === 'x402') {
        return signX402(params)
    } else {
        return signPermit(params)
    }
}

// ─── x402: EIP-3009 TransferWithAuthorization ───────────────────────────────

async function signX402(p: SignPaymentParams): Promise<PaymentData> {
    const nonceBytes = crypto.getRandomValues(new Uint8Array(32))
    const nonce = '0x' + Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('')
    const validAfter = '0'
    const validBefore = String(Math.floor(Date.now() / 1000) + 3600)

    const signature = await p.walletClient.signTypedData({
        account: p.address,
        domain: {
            name: p.tokenName,
            version: '1',
            chainId: BigInt(p.chainId),
            verifyingContract: p.tokenAddress,
        },
        types: {
            TransferWithAuthorization: [
                { name: 'from', type: 'address' },
                { name: 'to', type: 'address' },
                { name: 'value', type: 'uint256' },
                { name: 'validAfter', type: 'uint256' },
                { name: 'validBefore', type: 'uint256' },
                { name: 'nonce', type: 'bytes32' },
            ],
        },
        primaryType: 'TransferWithAuthorization',
        message: {
            from: p.address,
            to: p.payTo,
            value: p.amount,
            validAfter: 0n,
            validBefore: BigInt(validBefore),
            nonce: nonce as `0x${string}`,
        },
    })

    return create(PaymentDataSchema, {
        scheme: PaymentScheme.X402,
        payload: {
            case: 'x402',
            value: {
                x402Version: 1,
                scheme: 'exact',
                signature,
                authorization: {
                    from: p.address.toLowerCase(),
                    to: p.payTo.toLowerCase(),
                    value: p.amount.toString(),
                    validAfter,
                    validBefore,
                    nonce,
                },
            },
        },
    })
}

// ─── Permit: EIP-2612 ──────────────────────────────────────────────────────

async function signPermit(p: SignPaymentParams): Promise<PaymentData> {
    const nonce = await p.publicClient.readContract({
        address: p.tokenAddress,
        abi: [{
            type: 'function', name: 'nonces',
            inputs: [{ name: 'owner', type: 'address' }],
            outputs: [{ name: '', type: 'uint256' }],
            stateMutability: 'view',
        }] as const,
        functionName: 'nonces',
        args: [p.address],
    })
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)

    const signature = await p.walletClient.signTypedData({
        account: p.address,
        domain: {
            name: p.tokenName,
            version: '1',
            chainId: BigInt(p.chainId),
            verifyingContract: p.tokenAddress,
        },
        types: {
            Permit: [
                { name: 'owner', type: 'address' },
                { name: 'spender', type: 'address' },
                { name: 'value', type: 'uint256' },
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' },
            ],
        },
        primaryType: 'Permit',
        message: {
            owner: p.address,
            spender: p.payTo,
            value: p.amount,
            nonce,
            deadline,
        },
    })

    return create(PaymentDataSchema, {
        scheme: PaymentScheme.PERMIT,
        payload: {
            case: 'permit',
            value: {
                signature,
                owner: p.address.toLowerCase(),
                spender: p.payTo.toLowerCase(),
                value: p.amount.toString(),
                deadline: deadline.toString(),
                nonce: nonce.toString(),
            },
        },
    })
}
