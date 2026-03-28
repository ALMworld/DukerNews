/**
 * okx-payment-signer.ts — Frontend EIP-3009 payment signing for OKX gasless flow.
 *
 * EIP-3009 `transferWithAuthorization` lets a user pre-authorize a USDT transfer
 * via an EIP-712 signature — NO gas, NO on-chain transaction until OKX settles it.
 *
 * Usage:
 *   const { signPayment } = useOkxPaymentSigner()
 *   const payload = await signPayment({ amountMicro, payTo })
 *   // → send payload to server → server calls okxVerify + okxSettle
 *
 * Supported tokens (EIP-3009 compatible):
 *   - USDT₀ (XLayer mainnet): name='USDG', version='2'
 *   - MockUSDT (Sepolia/local): same domain structure
 */

import { useCallback } from 'react'
import { useSignTypedData, useAccount } from 'wagmi'
import { bytesToHex } from 'viem'
import { DEFAULT_CHAIN_ID, XLAYER_CHAIN_ID, SEPOLIA_CHAIN_ID, LOCAL_CHAIN_ID, getDefaultStablecoin } from './contracts'
import type { OkxPaymentPayload } from '../services/okx402-service'

// Generate a random 32-byte nonce using Web Crypto API (available in browsers + CF Workers)
const randomBytes32 = (): `0x${string}` => {
    const buf = new Uint8Array(32)
    crypto.getRandomValues(buf)
    return bytesToHex(buf)
}

// ── EIP-3009 Domain per chain/token ──────────────────────────────────────────

interface TokenDomain {
    name: string
    version: string
    chainId: number
    verifyingContract: `0x${string}`
}

/**
 * EIP-712 domain for EIP-3009 on each supported token.
 * Must match the token contract's domain hash exactly.
 */
function getTokenDomain(chainId: number): TokenDomain {
    const stablecoin = getDefaultStablecoin(chainId)
    switch (chainId) {
        case XLAYER_CHAIN_ID:
            return {
                name: 'USDG',               // USD₀ token name on XLayer
                version: '2',
                chainId: XLAYER_CHAIN_ID,
                verifyingContract: stablecoin.address,
            }
        case SEPOLIA_CHAIN_ID:
            return {
                name: 'MockUSDT',
                version: '1',
                chainId: SEPOLIA_CHAIN_ID,
                verifyingContract: stablecoin.address,
            }
        default:
            return {
                name: 'MockUSDT',
                version: '1',
                chainId: LOCAL_CHAIN_ID,
                verifyingContract: stablecoin.address,
            }
    }
}

// EIP-3009 typed data types (same for all EIP-3009 tokens)
const TransferWithAuthorizationTypes = {
    TransferWithAuthorization: [
        { name: 'from',        type: 'address' },
        { name: 'to',          type: 'address' },
        { name: 'value',       type: 'uint256' },
        { name: 'validAfter',  type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce',       type: 'bytes32' },
    ],
} as const

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface SignPaymentParams {
    /** Amount in micro-units (6 decimals for USDT) */
    amountMicro: bigint
    /** Recipient address — DukerNews contract */
    payTo: `0x${string}`
    /** Payment validity window in seconds (default: 300 = 5 min) */
    validForSeconds?: number
    /** Override chain ID (default: DEFAULT_CHAIN_ID) */
    chainId?: number
}

export function useOkxPaymentSigner() {
    const { address } = useAccount()
    const { signTypedDataAsync } = useSignTypedData()

    /**
     * Build + sign the EIP-3009 authorization.
     * Returns an OkxPaymentPayload ready to send to the server.
     */
    const signPayment = useCallback(async ({
        amountMicro,
        payTo,
        validForSeconds = 300,
        chainId = DEFAULT_CHAIN_ID,
    }: SignPaymentParams): Promise<OkxPaymentPayload> => {
        if (!address) throw new Error('Wallet not connected')
        if (amountMicro <= 0n) throw new Error('Amount must be > 0')

        const domain = getTokenDomain(chainId)
        const now = BigInt(Math.floor(Date.now() / 1000))
        const nonce = randomBytes32()

        const authorization = {
            from:        address,
            to:          payTo,
            value:       amountMicro,
            validAfter:  0n,                        // valid immediately
            validBefore: now + BigInt(validForSeconds),
            nonce,
        }

        const signature = await signTypedDataAsync({
            domain: {
                name:              domain.name,
                version:           domain.version,
                chainId:           BigInt(domain.chainId),
                verifyingContract: domain.verifyingContract,
            },
            types: TransferWithAuthorizationTypes,
            primaryType: 'TransferWithAuthorization',
            message: authorization,
        })

        // Build OkxPaymentPayload (matches okx402-service.ts type)
        return {
            x402Version: 1,
            scheme: 'exact',
            payload: {
                signature,
                authorization: {
                    from:        authorization.from,
                    to:          authorization.to,
                    value:       authorization.value.toString(),
                    validAfter:  authorization.validAfter.toString(),
                    validBefore: authorization.validBefore.toString(),
                    nonce:       authorization.nonce,
                },
            },
        }
    }, [address, signTypedDataAsync])

    return { signPayment }
}
