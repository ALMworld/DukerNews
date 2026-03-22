/**
 * Auth & mint API calls.
 */

export interface AuthRefreshResult {
    success: boolean
    data?: any
}

export interface X402MintResult {
    success: boolean
    data?: any
    message?: string
    txHash?: string
}

export interface NotifyTxEvent {
    eventType: number
    evtSeq: number
    username: string
    aggType: number
    aggId: number
}

export interface NotifyTxResult {
    success: boolean
    data?: any
    message?: string
    events?: NotifyTxEvent[]
}

/** POST /api/auth/refresh — verify on-chain username, re-issue JWT. */
export async function refreshAuth(dukiBps: number, txHash?: string): Promise<AuthRefreshResult> {
    const resp = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dukiBps, txHash }),
    })
    return resp.json()
}

/** POST /api/x402/mint-username — gasless username mint via x402. */
export async function x402MintUsername(username: string, amount: number, dukiBps: number): Promise<X402MintResult> {
    const resp = await fetch('/api/x402/mint-username', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, amount, dukiBps }),
    })
    return resp.json()
}

/** POST /api/notify-tx — parse DukerEvent from receipt and apply. */
export async function notifyTx(txHash: string, dukiBps?: number): Promise<NotifyTxResult> {
    const resp = await fetch('/api/notify-tx', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash, dukiBps }),
    })
    return resp.json()
}
