/**
 * Client-side auth API service.
 * All requests use credentials: 'include' for cookie-based auth.
 */
import type { AuthUser } from './authStore'

interface CommonResponse<T> {
    success: boolean
    message: string
    data: T
}

interface NonceData {
    nonce: string
}

async function post<T>(endpoint: string, body: any = {}): Promise<T> {
    const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
    })
    if (!resp.ok) {
        const text = await resp.text().catch(() => resp.statusText)
        throw new Error(text || `HTTP ${resp.status}`)
    }
    return resp.json()
}

export const authApi = {
    getNonce: async (): Promise<string> => {
        const resp = await post<CommonResponse<NonceData>>('/api/auth/nonce')
        if (!resp.success) throw new Error(resp.message || 'Failed to get nonce')
        return resp.data.nonce
    },

    login: async (message: string, signature: string): Promise<AuthUser> => {
        const resp = await post<CommonResponse<AuthUser>>('/api/auth/login', { message, signature })
        if (!resp.success) throw new Error(resp.message || 'Login failed')
        return resp.data
    },

    logout: async (): Promise<void> => {
        await post('/api/auth/logout')
    },

    me: async (): Promise<AuthUser | null> => {
        try {
            const resp = await post<CommonResponse<AuthUser>>('/api/auth/me')
            if (!resp.success) return null
            return resp.data
        } catch {
            return null
        }
    },
}
