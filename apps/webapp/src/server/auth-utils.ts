/**
 * Server-side auth utilities — JWT signing/verification, nonce store, cookie config.
 * Used by API routes: /api/auth/nonce, /api/auth/login, /api/auth/logout, /api/auth/me
 */
import * as jose from 'jose'

// ─── Configuration ───────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'duker-news-dev-secret-change-in-prod'
const COOKIE_NAME = 'auth_session'
const JWT_EXPIRY_SECS = 7 * 24 * 60 * 60 // 7 days
const NONCE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export { COOKIE_NAME }

// ─── JWT ─────────────────────────────────────────────────

export interface JWTPayload {
    ego: string       // wallet address
    chainId: string
    username?: string // set after MINT_NAME; empty means onboarding not complete
    dukiBps?: number  // basis points for DUKI distribution (0-10000)
    expireAt: number
}

let secretKey: Uint8Array | null = null
function getSecretKey(): Uint8Array {
    if (!secretKey) {
        secretKey = new TextEncoder().encode(JWT_SECRET)
    }
    return secretKey
}

export async function signJwt(payload: JWTPayload): Promise<string> {
    return new jose.SignJWT({ ...payload })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(`${JWT_EXPIRY_SECS}s`)
        .sign(getSecretKey())
}

export async function verifyJwt(token: string): Promise<JWTPayload | null> {
    try {
        const { payload } = await jose.jwtVerify(token, getSecretKey())
        const data = payload as unknown as JWTPayload
        // Check custom expiry
        if (data.expireAt && data.expireAt < Math.floor(Date.now() / 1000)) {
            return null
        }
        return data
    } catch {
        return null
    }
}

export function getJwtExpirySecs(): number {
    return JWT_EXPIRY_SECS
}

// ─── Nonce Store (in-memory with TTL cleanup) ─────────────

const nonceStore = new Map<string, number>() // nonce → expiry timestamp

export function storeNonce(nonce: string): void {
    // Cleanup expired nonces every time (lightweight since map is small)
    const now = Date.now()
    for (const [k, exp] of nonceStore) {
        if (exp < now) nonceStore.delete(k)
    }
    nonceStore.set(nonce, now + NONCE_TTL_MS)
}

export function consumeNonce(nonce: string): boolean {
    const exp = nonceStore.get(nonce)
    if (!exp) return false
    nonceStore.delete(nonce)
    return exp > Date.now()
}

// ─── Cookie Helpers ──────────────────────────────────────

export function buildCookieHeader(token: string): string {
    const isDev = process.env.NODE_ENV !== 'production'
    const maxAge = JWT_EXPIRY_SECS
    const parts = [
        `${COOKIE_NAME}=${token}`,
        `Path=/`,
        `HttpOnly`,
        `SameSite=Lax`,
        `Max-Age=${maxAge}`,
    ]
    if (!isDev) parts.push('Secure')
    return parts.join('; ')
}

export function buildDeleteCookieHeader(): string {
    const isDev = process.env.NODE_ENV !== 'production'
    const parts = [
        `${COOKIE_NAME}=`,
        `Path=/`,
        `HttpOnly`,
        `SameSite=Lax`,
        `Max-Age=0`,
    ]
    if (!isDev) parts.push('Secure')
    return parts.join('; ')
}

export function parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {}
    for (const pair of cookieHeader.split(';')) {
        const [key, ...rest] = pair.trim().split('=')
        if (key) cookies[key.trim()] = rest.join('=').trim()
    }
    return cookies
}

// ─── SIWE Message Parsing (lightweight, no ethers needed) ──

export function getAddressFromMessage(message: string): string {
    // SIWE format line 1: "{domain} wants you to sign in with your Ethereum account:"
    // line 2: "0x..."
    const match = message.match(/0x[a-fA-F0-9]{40}/)
    return match ? match[0] : ''
}

export function getChainIdFromMessage(message: string): string {
    const match = message.match(/Chain ID:\s*(\d+)/)
    return match ? match[1] : '1'
}

export function getNonceFromMessage(message: string): string {
    const match = message.match(/Nonce:\s*([a-zA-Z0-9]+)/)
    return match ? match[1] : ''
}
