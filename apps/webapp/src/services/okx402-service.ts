/**
 * okx402-service.ts — OKX Seller x402 Payment API client.
 *
 * Handles the 3-step seller flow for gasless payments:
 *   1. Build paymentRequirements (returned in 402 response to buyer)
 *   2. okxVerify()  — validate buyer's EIP-3009 signed payload (off-chain check)
 *   3. okxSettle()  — Facilitator submits tx on-chain, USDT lands in payTo address
 *
 * After settlement, the caller calls DukerNews contract as operator (separate step).
 *
 * Auth: OKX REST API requires HMAC-SHA256 signature on every request.
 *   Header: OK-ACCESS-SIGN = base64(HMAC-SHA256(timestamp+method+path+body, secretKey))
 *
 * Env vars required:
 *   OKX_API_KEY       — API key from dev portal
 *   OKX_SECRET_KEY    — Secret key for HMAC signing
 *   OKX_PASSPHRASE    — Passphrase set during API key creation
 */

import { createHmac } from 'node:crypto'

// ── OKX API base ─────────────────────────────────────────────────────────────

const OKX_BASE = 'https://web3.okx.com'

// Chain index for XLayer mainnet (OKX uses index, not EIP-155 chain ID)
export const XLAYER_CHAIN_INDEX = 196

// XLayer stablecoin: USDT₀ (ERC-20, 6 decimals)
export const XLAYER_USDT_ADDRESS = '0x779Ded0c9e1022225f8E0630b35a9b54bE713736'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OkxPaymentRequirements {
    scheme: 'exact'
    maxAmountRequired: string          // micro-units (string)
    resource: string                   // descriptive resource URL
    description: string
    mimeType: string
    payTo: string                      // recipient contract/wallet address
    maxTimeoutSeconds: number
    asset: string                      // ERC-20 token contract address
    extra?: Record<string, string>
}

/** EIP-3009 transferWithAuthorization payload from buyer's wallet */
export interface OkxPaymentPayload {
    x402Version: number
    scheme: 'exact'
    payload: {
        signature: string
        authorization: {
            from: string
            to: string
            value: string
            validAfter: string
            validBefore: string
            nonce: string
        }
    }
}

export interface OkxVerifyResult {
    isValid: boolean
    invalidReason: string | null
    payer: string
}

export interface OkxSettleResult {
    success: boolean
    errorReason: string | null
    payer: string
    txHash: string
    chainIndex: string
    chainName: string
}

// ── HMAC Auth ─────────────────────────────────────────────────────────────────

function getOkxCredentials() {
    const apiKey = process.env.OKX_API_KEY
    const secretKey = process.env.OKX_SECRET_KEY
    const passphrase = process.env.OKX_PASSPHRASE
    if (!apiKey || !secretKey || !passphrase) {
        throw new Error(
            'Missing OKX credentials: set OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE in environment'
        )
    }
    return { apiKey, secretKey, passphrase }
}

/**
 * Build OKX REST auth headers for a signed request.
 * Sign: HMAC-SHA256(timestamp + method + requestPath + body, secretKey) → base64
 */
function buildOkxAuthHeaders(method: 'GET' | 'POST', path: string, body: string): Record<string, string> {
    const { apiKey, secretKey, passphrase } = getOkxCredentials()
    const timestamp = new Date().toISOString()
    const message = timestamp + method + path + body
    const sign = createHmac('sha256', secretKey)
        .update(message)
        .digest('base64')
    return {
        'Content-Type': 'application/json',
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': sign,
        'OK-ACCESS-PASSPHRASE': passphrase,
        'OK-ACCESS-TIMESTAMP': timestamp,
    }
}

async function okxPost<T>(path: string, bodyObj: object): Promise<T> {
    const body = JSON.stringify(bodyObj)
    const headers = buildOkxAuthHeaders('POST', path, body)
    const res = await fetch(`${OKX_BASE}${path}`, { method: 'POST', headers, body })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`OKX API ${path} HTTP ${res.status}: ${text}`)
    }
    const json = await res.json() as { code: string; msg: string; data: T }
    if (json.code !== '0') {
        throw new Error(`OKX API ${path} error code=${json.code}: ${json.msg}`)
    }
    return json.data
}

async function okxGet<T>(path: string): Promise<T> {
    const headers = buildOkxAuthHeaders('GET', path, '')
    const res = await fetch(`${OKX_BASE}${path}`, { method: 'GET', headers })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`OKX API ${path} HTTP ${res.status}: ${text}`)
    }
    const json = await res.json() as { code: string; msg: string; data: T }
    if (json.code !== '0') {
        throw new Error(`OKX API ${path} error code=${json.code}: ${json.msg}`)
    }
    return json.data
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get supported networks/schemes from OKX Facilitator.
 * Use to verify API key works + inspect which chains are live.
 */
export async function okxGetSupported() {
    const path = '/api/v6/x402/supported'
    return okxGet<Array<{
        x402Version: number
        scheme: string
        chainIndex: string
        chainName: string
    }>>(path)
}

/**
 * Build paymentRequirements for a given payment.
 * This is included in the 402 response to the buyer.
 */
export function buildPaymentRequirements(params: {
    payTo: string
    amountMicro: bigint
    asset?: string
    description?: string
    resource?: string
}): OkxPaymentRequirements {
    // OKX Facilitator only supports X Layer USDT — reject others early
    if (params.asset && params.asset.toLowerCase() !== XLAYER_USDT_ADDRESS.toLowerCase()) {
        throw new Error(`Unsupported x402 asset: ${params.asset}. Only X Layer USDT (${XLAYER_USDT_ADDRESS}) is supported.`)
    }
    return {
        scheme: 'exact',
        maxAmountRequired: params.amountMicro.toString(),
        resource: params.resource ?? 'https://dukernews.com/api/tx',
        description: params.description ?? 'DukerNews gasless payment',
        mimeType: 'application/json',
        payTo: params.payTo,
        maxTimeoutSeconds: 300,
        asset: XLAYER_USDT_ADDRESS,
        extra: {},
    }
}

/**
 * Step 1: Verify buyer's EIP-3009 signed payload.
 * Returns the payer address if valid.
 */
export async function okxVerify(
    paymentPayload: OkxPaymentPayload,
    paymentRequirements: OkxPaymentRequirements,
): Promise<OkxVerifyResult> {
    const [result] = await okxPost<[OkxVerifyResult]>('/api/v6/x402/verify', {
        x402Version: 1,
        chainIndex: XLAYER_CHAIN_INDEX,
        paymentPayload,
        paymentRequirements,
    })
    if (!result.isValid) {
        throw new Error(`OKX payment verification failed: ${result.invalidReason}`)
    }
    return result
}

/**
 * Step 2: Settle — OKX Facilitator submits buyer's signed transfer tx on-chain.
 * syncSettle=true: waits for chain confirmation before returning txHash.
 * After this call, the payTo address has received the USDT.
 */
export async function okxSettle(
    paymentPayload: OkxPaymentPayload,
    paymentRequirements: OkxPaymentRequirements,
    syncSettle = true,
): Promise<OkxSettleResult> {
    const [result] = await okxPost<[OkxSettleResult]>('/api/v6/x402/settle', {
        x402Version: 1,
        chainIndex: XLAYER_CHAIN_INDEX,
        syncSettle,
        paymentPayload,
        paymentRequirements,
    })
    if (!result.success) {
        throw new Error(`OKX settlement failed: ${result.errorReason}`)
    }
    return result
}

/**
 * Convenience: verify + settle in one call.
 * Returns the settlement txHash (payment chain).
 */
export async function okxVerifyAndSettle(
    paymentPayload: OkxPaymentPayload,
    paymentRequirements: OkxPaymentRequirements,
): Promise<{ payer: string; paymentTxHash: string }> {
    const verified = await okxVerify(paymentPayload, paymentRequirements)
    const settled = await okxSettle(paymentPayload, paymentRequirements)
    return { payer: verified.payer, paymentTxHash: settled.txHash }
}
