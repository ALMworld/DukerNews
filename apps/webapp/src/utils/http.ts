import { useAppStore } from '../store/useAppStore';

export const API_BASE = import.meta.env.VITE_API_URL || 'https://api.app.bagua.world';

interface RequestOptions extends RequestInit {
    params?: Record<string, string>
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { params, ...init } = options
    const url = new URL(endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`)

    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.append(key, value)
        })
    }

    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...init.headers,
    }

    const response = await fetch(url.toString(), {
        credentials: 'include',
        ...init,
        headers,
    })

    if (!response.ok) {
        if (response.status === 401) {
            useAppStore.getState().setAuthStatus('unauthenticated')
            useAppStore.getState().setMe(null)
        }
        throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`)
    }

    if (response.status === 204) {
        return {} as T
    }

    return response.json()
}

export const http = {
    get: <T>(endpoint: string, options?: RequestOptions) => request<T>(endpoint, { method: 'GET', ...options }),
    post: <T>(endpoint: string, body: any, options?: RequestOptions) => request<T>(endpoint, { method: 'POST', body: JSON.stringify(body), ...options }),
}
