/**
 * Auth API calls.
 */

export interface AuthRefreshResult {
    success: boolean
    data?: any
}

/** POST /api/auth/refresh — verify on-chain username, re-issue JWT. */
export async function refreshAuth(dukiBps: number = 0, txHash?: string): Promise<AuthRefreshResult> {
    const resp = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dukiBps, txHash }),
    })
    return resp.json()
}
