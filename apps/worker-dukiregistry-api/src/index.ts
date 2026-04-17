/**
 * index.ts — DukerRegistry Worker entry point.
 *
 * Hono + ConnectRPC worker that indexes DukerRegistry (identity)
 * and DukigenRegistry (agent/payment) events into D1.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { App } from './context'
import {
    UniversalHandler,
    universalServerRequestFromFetch,
    universalServerResponseToFetch,
} from '@connectrpc/connect/protocol'
import { createConnectRouter, createContextValues } from '@connectrpc/connect'
import { registerGrpcRoutes, setDb } from './routes/grpc'

const app = new Hono<App>()

// ── CORS middleware ─────────────────────────────────────────
app.use('*', async (c, next) => {
    const allowed = (c.env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim())
    return cors({
        origin: (origin) => {
            if (!origin) return '*'
            for (const pattern of allowed) {
                if (pattern === origin) return origin
                if (pattern.includes('*')) {
                    const re = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
                    if (re.test(origin)) return origin
                }
            }
            return ''
        },
        allowHeaders: ['Content-Type', 'Connect-Protocol-Version', 'Connect-Timeout-Ms'],
        allowMethods: ['POST', 'GET', 'OPTIONS'],
        maxAge: 86400,
    })(c, next)
})

// ── Health check ────────────────────────────────────────────
app.get('/', (c) => c.json({ ok: true, service: 'duker-registry-worker' }))

// ── Dev: inject chain config at runtime (for integration tests) ──
app.post('/_dev/config', async (c) => {
    if (c.env.ENVIRONMENT === 'production') return c.json({ error: 'Not available in production' }, 403)
    const { setChainConfig } = await import('./config')
    const body = await c.req.json() as { chainEid: number; dukerRegistryAddress?: string; dukigenRegistryAddress?: string; rpcUrl?: string }
    setChainConfig(body.chainEid, {
        ...(body.rpcUrl && { rpcUrl: body.rpcUrl }),
        ...(body.dukerRegistryAddress && { dukerRegistryAddress: body.dukerRegistryAddress as `0x${string}` }),
        ...(body.dukigenRegistryAddress && { dukigenRegistryAddress: body.dukigenRegistryAddress as `0x${string}` }),
    })
    return c.json({ ok: true, chainEid: body.chainEid })
})

// ── ConnectRPC router ───────────────────────────────────────
const grpcRouter = createConnectRouter({
    connect: true,
    requireConnectProtocolHeader: false,
    jsonOptions: { ignoreUnknownFields: true },
})
registerGrpcRoutes(grpcRouter)

// Mount each handler as a Hono route
const handlers = new Map<string, UniversalHandler>()
for (const h of grpcRouter.handlers) {
    handlers.set(h.requestPath, h)
}

for (const [path, handler] of handlers) {
    app.post(path, async (c) => {
        // Inject D1 for this request
        setDb(c.env.DB)

        try {
            const uReq = {
                ...universalServerRequestFromFetch(c.req.raw, {}),
                contextValues: createContextValues(),
            }
            const uRes = await handler(uReq)
            return universalServerResponseToFetch(uRes)
        } catch (error) {
            console.error(`ConnectRPC error on ${path}:`, error)
            return c.json({
                code: 'internal',
                message: error instanceof Error ? error.message : 'Unknown error',
            }, 500)
        }
    })
}

export default app