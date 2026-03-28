/**
 * OnchainOS REST API Client
 *
 * Native TypeScript client for OKX OnchainOS Agentic Wallet.
 * Replaces the CLI `execSync` approach with direct HTTPS calls.
 *
 * Base URL: https://web3.okx.com
 *
 * Auth modes:
 *   1. JWT Bearer (after login via email OTP or API key)
 *   2. API Key HMAC-SHA256 (for unauthenticated wallet operations)
 *
 * Transaction flow (contract-call):
 *   1. unsignedInfo  → get unsigned tx hash + extraData
 *   2. Local ed25519 sign of unsignedTxHash using session key
 *   3. broadcast-transaction → TEE does final ECDSA signing
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// ── Config ──────────────────────────────────────────────────────────────

const BASE_URL = process.env.OKX_BASE_URL || 'https://web3.okx.com'
const CLIENT_VERSION = '2.0.0'

// ── Persistent session storage ──────────────────────────────────────────

const ONCHAINOS_HOME = path.join(os.homedir(), '.onchainos')

function ensureHome() {
    if (!fs.existsSync(ONCHAINOS_HOME)) {
        fs.mkdirSync(ONCHAINOS_HOME, { recursive: true })
    }
}

interface SessionData {
    accessToken: string
    refreshToken: string
    sessionCert: string
    encryptedSessionSk: string
    sessionKey: string
    projectId: string
    accountId: string
    accountName: string
    email: string
    wallets: WalletData | null
}

interface WalletData {
    selectedAccountId: string
    accountsMap: Record<string, {
        addressList: AddressInfo[]
    }>
}

interface AddressInfo {
    accountId: string
    address: string
    chainIndex: string
    chainName: string
    addressType: string
    chainPath: string
}

function loadSession(): SessionData | null {
    const p = path.join(ONCHAINOS_HOME, 'session.json')
    if (!fs.existsSync(p)) return null
    try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'))
    } catch {
        return null
    }
}

function saveSession(data: SessionData) {
    ensureHome()
    fs.writeFileSync(
        path.join(ONCHAINOS_HOME, 'session.json'),
        JSON.stringify(data, null, 2),
    )
}

// ── HMAC signing (for API key auth mode) ────────────────────────────────

function hmacSign(
    secretKey: string,
    timestamp: string,
    method: string,
    requestPath: string,
    body: string,
): string {
    const prehash = `${timestamp}${method}${requestPath}${body}`
    return crypto
        .createHmac('sha256', secretKey)
        .update(prehash)
        .digest('base64')
}

// ── HTTP helpers ────────────────────────────────────────────────────────

function baseHeaders(): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'ok-client-version': CLIENT_VERSION,
        'Ok-Access-Client-type': 'agent-cli',
    }
}

function jwtHeaders(token: string): Record<string, string> {
    return {
        ...baseHeaders(),
        Authorization: `Bearer ${token}`,
    }
}

interface ApiResponse {
    code: string | number
    msg?: string
    data: any
}

/** Parse the standard OKX envelope: { code, msg, data } */
async function handleResponse(resp: Response): Promise<any> {
    if (resp.status >= 500) {
        throw new Error(`OKX API server error (HTTP ${resp.status})`)
    }
    const body: ApiResponse = await resp.json()
    const codeOk =
        (typeof body.code === 'string' && body.code === '0') ||
        (typeof body.code === 'number' && body.code === 0)
    if (!codeOk) {
        throw new Error(`OKX API error [${body.code}]: ${body.msg || 'unknown'}`)
    }
    return body.data
}

async function postPublic(path: string, body: object): Promise<any> {
    const url = `${BASE_URL}${path}`
    const resp = await fetch(url, {
        method: 'POST',
        headers: baseHeaders(),
        body: JSON.stringify(body),
    })
    return handleResponse(resp)
}

async function postAuthed(path: string, accessToken: string, body: object): Promise<any> {
    const url = `${BASE_URL}${path}`
    const resp = await fetch(url, {
        method: 'POST',
        headers: jwtHeaders(accessToken),
        body: JSON.stringify(body),
    })
    return handleResponse(resp)
}

async function getAuthed(
    apiPath: string,
    accessToken: string,
    query: Record<string, string> = {},
): Promise<any> {
    const qs = new URLSearchParams(query).toString()
    const url = `${BASE_URL}${apiPath}${qs ? '?' + qs : ''}`
    const resp = await fetch(url, {
        method: 'GET',
        headers: jwtHeaders(accessToken),
    })
    return handleResponse(resp)
}

// ── JWT helpers ─────────────────────────────────────────────────────────

function decodeJwtPayload(token: string): any {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    try {
        const payload = Buffer.from(parts[1], 'base64url').toString('utf-8')
        return JSON.parse(payload)
    } catch {
        return null
    }
}

function isJwtExpired(token: string): boolean {
    const payload = decodeJwtPayload(token)
    if (!payload?.exp) return true
    return Date.now() / 1000 >= payload.exp
}

// ── Auth API ────────────────────────────────────────────────────────────

/** POST /priapi/v5/wallet/agentic/auth/init — start email login */
export async function authInit(email: string): Promise<{ flowId: string }> {
    const data = await postPublic('/priapi/v5/wallet/agentic/auth/init', { email })
    const item = Array.isArray(data) ? data[0] : data
    return { flowId: item.flowId }
}

export interface VerifyResponse {
    refreshToken: string
    accessToken: string
    teeId: string
    sessionCert: string
    encryptedSessionSk: string
    sessionKeyExpireAt: string
    projectId: string
    accountId: string
    accountName: string
    isNew: boolean
    addressList: AddressInfo[]
}

/** POST /priapi/v5/wallet/agentic/auth/verify — verify OTP, get JWT + session */
export async function authVerify(
    email: string,
    flowId: string,
    otp: string,
    tempPubKey: string,
): Promise<VerifyResponse> {
    const data = await postPublic('/priapi/v5/wallet/agentic/auth/verify', {
        email,
        flowId,
        otp,
        tempPubKey,
    })
    const item = Array.isArray(data) ? data[0] : data
    return item as VerifyResponse
}

/** POST /priapi/v5/wallet/agentic/auth/ak/init — start API key login */
export async function akAuthInit(apiKey: string): Promise<{ nonce: string; iss: string }> {
    const data = await postPublic('/priapi/v5/wallet/agentic/auth/ak/init', { apiKey })
    const item = Array.isArray(data) ? data[0] : data
    return { nonce: item.nonce, iss: item.iss }
}

/** POST /priapi/v5/wallet/agentic/auth/ak/verify */
export async function akAuthVerify(
    tempPubKey: string,
    apiKey: string,
    passphrase: string,
    timestamp: string,
    sign: string,
    locale: string = 'en',
): Promise<VerifyResponse> {
    const data = await postPublic('/priapi/v5/wallet/agentic/auth/ak/verify', {
        tempPubKey,
        apiKey,
        passphrase,
        timestamp,
        sign,
        locale,
    })
    const item = Array.isArray(data) ? data[0] : data
    return item as VerifyResponse
}

/** POST /priapi/v5/wallet/agentic/auth/refresh */
export async function authRefresh(refreshToken: string): Promise<{
    accessToken: string
    refreshToken: string
}> {
    const data = await postPublic('/priapi/v5/wallet/agentic/auth/refresh', { refreshToken })
    const item = Array.isArray(data) ? data[0] : data
    return { accessToken: item.accessToken, refreshToken: item.refreshToken }
}

// ── Account API ─────────────────────────────────────────────────────────

export async function accountList(accessToken: string, projectId: string) {
    const data = await postAuthed(
        '/priapi/v5/wallet/agentic/account/list',
        accessToken,
        { projectId },
    )
    return Array.isArray(data) ? data : []
}

export async function accountAddressList(accessToken: string, accountIds: string[]) {
    const data = await postAuthed(
        '/priapi/v5/wallet/agentic/account/address/list',
        accessToken,
        { accountIds },
    )
    const item = Array.isArray(data) ? data[0] : data
    return item?.accounts || []
}

// ── Balance API ─────────────────────────────────────────────────────────

export async function getBalances(
    accessToken: string,
    accountId: string,
    chainIndex?: string,
): Promise<any> {
    const query: Record<string, string> = { accountId }
    if (chainIndex) query.chainIndex = chainIndex
    return getAuthed(
        '/priapi/v5/wallet/agentic/asset/wallet-all-token-balances',
        accessToken,
        query,
    )
}

// ── Transaction API ─────────────────────────────────────────────────────

export interface UnsignedInfoResponse {
    unsignedTxHash: string
    unsignedTx: string
    hash: string
    uopHash: string
    authHashFor7702: string
    executeErrorMsg: string
    executeResult: any
    extraData: any
    signType: string
    encoding: string
}

/** POST /priapi/v5/wallet/agentic/pre-transaction/unsignedInfo */
export async function getUnsignedInfo(
    accessToken: string,
    params: {
        chainPath: string
        chainIndex: number
        fromAddr: string
        toAddr: string
        amount: string
        sessionCert: string
        contractAddr?: string
        inputData?: string
        gasLimit?: string
    },
): Promise<UnsignedInfoResponse> {
    const body: any = {
        chainPath: params.chainPath,
        chainIndex: params.chainIndex,
        fromAddr: params.fromAddr,
        toAddr: params.toAddr,
        amount: params.amount,
        sessionCert: params.sessionCert,
    }
    if (params.contractAddr) body.contractAddr = params.contractAddr
    if (params.inputData) body.inputData = params.inputData
    if (params.gasLimit) body.gasLimit = params.gasLimit

    const data = await postAuthed(
        '/priapi/v5/wallet/agentic/pre-transaction/unsignedInfo',
        accessToken,
        body,
    )
    const item = Array.isArray(data) ? data[0] : data
    return item as UnsignedInfoResponse
}

export interface BroadcastResponse {
    pkgId: string
    orderId: string
    orderType: string
    txHash: string
}

/** POST /priapi/v5/wallet/agentic/pre-transaction/broadcast-transaction */
export async function broadcastTransaction(
    accessToken: string,
    params: {
        accountId: string
        address: string
        chainIndex: string
        extraData: string
    },
): Promise<BroadcastResponse> {
    const data = await postAuthed(
        '/priapi/v5/wallet/agentic/pre-transaction/broadcast-transaction',
        accessToken,
        params,
    )
    const item = Array.isArray(data) ? data[0] : data
    return item as BroadcastResponse
}

// ── High-level: Ensure tokens ───────────────────────────────────────────

/** Ensure we have a valid access token. Refreshes if expired. */
export async function ensureAccessToken(): Promise<string> {
    const session = loadSession()
    if (!session) throw new Error('Not logged in. Run login first.')

    if (!isJwtExpired(session.accessToken)) {
        return session.accessToken
    }

    // Try refresh
    if (session.refreshToken && !isJwtExpired(session.refreshToken)) {
        const refreshed = await authRefresh(session.refreshToken)
        session.accessToken = refreshed.accessToken
        session.refreshToken = refreshed.refreshToken
        saveSession(session)
        return session.accessToken
    }

    throw new Error('Session expired. Please login again.')
}

// ── High-level: Login flow ──────────────────────────────────────────────

/**
 * Login via API key (non-interactive).
 * Requires: OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE in env.
 */
export async function loginWithApiKey(): Promise<SessionData> {
    const apiKey = process.env.OKX_API_KEY
    const secretKey = process.env.OKX_SECRET_KEY
    const passphrase = process.env.OKX_PASSPHRASE
    if (!apiKey || !secretKey || !passphrase) {
        throw new Error('Missing OKX_API_KEY, OKX_SECRET_KEY, or OKX_PASSPHRASE')
    }

    // Step 1: ak/init → get nonce
    const { nonce } = await akAuthInit(apiKey)

    // Step 2: Generate temp key pair (X25519 for HPKE key encapsulation)
    const tempKeyPair = crypto.generateKeyPairSync('x25519')
    const tempPubKeyRaw = tempKeyPair.publicKey.export({ type: 'spki', format: 'der' })
    const tempPubKey = Buffer.from(tempPubKeyRaw).toString('base64')

    // Step 3: Sign nonce with HMAC
    const timestamp = new Date().toISOString()
    const sign = hmacSign(secretKey, timestamp, 'POST', '/priapi/v5/wallet/agentic/auth/ak/verify', '')

    // Step 4: ak/verify → get JWT + session
    const verifyResp = await akAuthVerify(
        tempPubKey,
        apiKey,
        passphrase,
        timestamp,
        sign,
    )

    // Save session
    const sessionData: SessionData = {
        accessToken: verifyResp.accessToken,
        refreshToken: verifyResp.refreshToken,
        sessionCert: verifyResp.sessionCert,
        encryptedSessionSk: verifyResp.encryptedSessionSk,
        sessionKey: '', // Will be derived from HPKE key exchange
        projectId: verifyResp.projectId,
        accountId: verifyResp.accountId,
        accountName: verifyResp.accountName,
        email: '',
        wallets: null,
    }

    // Build wallet data from addressList
    if (verifyResp.addressList?.length) {
        sessionData.wallets = {
            selectedAccountId: verifyResp.accountId,
            accountsMap: {
                [verifyResp.accountId]: {
                    addressList: verifyResp.addressList,
                },
            },
        }
    }

    saveSession(sessionData)
    return sessionData
}

// ── High-level: Get wallet status ───────────────────────────────────────

export function getWalletStatus(): {
    loggedIn: boolean
    address: string | null
    accountName: string | null
    accountId: string | null
} {
    const session = loadSession()
    if (!session) return { loggedIn: false, address: null, accountName: null, accountId: null }

    // Find EVM address for X Layer (chainIndex = 196 or any EVM)
    let evmAddress: string | null = null
    if (session.wallets) {
        const acctId = session.wallets.selectedAccountId
        const entry = session.wallets.accountsMap[acctId]
        if (entry) {
            const evmAddr = entry.addressList.find(
                a => a.chainName === 'okb' || a.addressType === 'eoa',
            )
            if (evmAddr) evmAddress = evmAddr.address
        }
    }

    return {
        loggedIn: !isJwtExpired(session.accessToken),
        address: evmAddress,
        accountName: session.accountName,
        accountId: session.accountId,
    }
}

// ── High-level: Contract call ───────────────────────────────────────────

/**
 * Execute a contract call via OnchainOS TEE signing.
 *
 * Flow:
 *   1. Get unsigned tx info from API
 *   2. Local ed25519 sign of unsignedTxHash
 *   3. Broadcast via API (TEE does final ECDSA signing)
 */
export async function contractCall(params: {
    to: string
    chainIndex: number
    inputData: string
    amount?: string
    gasLimit?: string
}): Promise<BroadcastResponse> {
    const accessToken = await ensureAccessToken()
    const session = loadSession()
    if (!session || !session.wallets) throw new Error('Not logged in')

    // Resolve sender address
    const acctId = session.wallets.selectedAccountId
    const entry = session.wallets.accountsMap[acctId]
    if (!entry) throw new Error('No wallet account found')

    const addrInfo = entry.addressList.find(
        a => a.chainIndex === String(params.chainIndex)
            || a.chainName === 'okb', // X Layer
    )
    if (!addrInfo) throw new Error(`No address for chainIndex ${params.chainIndex}`)

    // Step 1: Get unsigned info
    const unsigned = await getUnsignedInfo(accessToken, {
        chainPath: addrInfo.chainPath,
        chainIndex: params.chainIndex,
        fromAddr: addrInfo.address,
        toAddr: params.to,
        amount: params.amount || '0',
        sessionCert: session.sessionCert,
        contractAddr: params.to,
        inputData: params.inputData,
        gasLimit: params.gasLimit,
    })

    // Check simulation result
    if (unsigned.executeResult === false) {
        throw new Error(`Simulation failed: ${unsigned.executeErrorMsg || 'unknown'}`)
    }

    // Step 2: Build extraData with session signature
    // NOTE: The ed25519 signing requires the session key + HPKE decryption
    // of encryptedSessionSk. For now, we pass the unsigned data directly
    // and let the TEE side handle signing if session signature is empty.
    const extraData: any = unsigned.extraData || {}
    extraData.checkBalance = true
    extraData.uopHash = unsigned.uopHash || ''
    extraData.encoding = unsigned.encoding || ''
    extraData.signType = unsigned.signType || ''
    extraData.skipWarning = true

    // Add unsigned tx info for TEE to sign
    const msgForSign: any = {}
    if (unsigned.unsignedTxHash) {
        msgForSign.unsignedTxHash = unsigned.unsignedTxHash
    }
    if (unsigned.unsignedTx) {
        msgForSign.unsignedTx = unsigned.unsignedTx
    }
    if (session.sessionCert) {
        msgForSign.sessionCert = session.sessionCert
    }
    extraData.msgForSign = msgForSign

    // Step 3: Broadcast
    const result = await broadcastTransaction(accessToken, {
        accountId: acctId,
        address: addrInfo.address,
        chainIndex: addrInfo.chainIndex,
        extraData: JSON.stringify(extraData),
    })

    return result
}

// ── Re-exports for convenience ──────────────────────────────────────────

export { loadSession, saveSession, type SessionData, type AddressInfo }
