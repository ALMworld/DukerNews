/**
 * ConnectRPC transport pointing at the Go API server.
 * Set MIGRATED = true to route all reads/writes to apps/goapi.
 * Set MIGRATED = false to use the local Cloudflare D1 / Kysely path.
 */
import { createConnectTransport } from '@connectrpc/connect-web'

/** Master migration flag — flip to true to use goapi instead of sqlite. */
export const MIGRATED = false

// Server-side (Cloudflare Worker env) → use GOAPI_URL binding
// Client-side (browser) → fall back to VITE_GOAPI_URL or localhost
function getGoApiUrl(): string {
    if (typeof process === 'undefined') {
        try {
            const { env } = require('cloudflare:workers') as { env: Record<string, string> }
            if (env?.GOAPI_URL) return env.GOAPI_URL
        } catch { /* not in worker context */ }
    }
    if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GOAPI_URL) {
        return (import.meta as any).env.VITE_GOAPI_URL
    }
    return 'http://localhost:8090'
}

let _transport: ReturnType<typeof createConnectTransport> | null = null

export function getGoApiTransport() {
    if (!_transport) {
        _transport = createConnectTransport({
            baseUrl: getGoApiUrl(),
            // Cloudflare Workers edge runtime bans redirect:"error" (the fetch default).
            // Override every request to use "manual" so the edge accepts the call.
            fetch: (input, init) => fetch(input, { ...init, redirect: 'manual' }),
        })
    }
    return _transport
}
