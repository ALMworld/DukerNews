/**
 * index.ts — DukerRegistry Worker entry point.
 *
 * Hono + ConnectRPC worker that indexes DukerRegistry (identity)
 * and DukigenRegistry (agent/payment) events into D1.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { App, Env } from './context'
import {
    UniversalHandler,
    universalServerRequestFromFetch,
    universalServerResponseToFetch,
} from '@connectrpc/connect/protocol'
import { createConnectRouter, createContextValues } from '@connectrpc/connect'
import { registerGrpcRoutes, setDb } from './routes/grpc'
import { devtools } from './routes/devtools'
import { maybeRunAgentMetricsTask } from './services/agent-metrics-task'

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
        allowHeaders: ['Content-Type', 'Connect-Protocol-Version', 'Connect-Timeout-Ms', 'x-devtools-token'],
        allowMethods: ['POST', 'GET', 'OPTIONS'],
        maxAge: 86400,
    })(c, next)
})

// ── Health check ────────────────────────────────────────────
app.get('/', (c) => c.json({ ok: true, service: 'duker-registry-worker' }))

// ── Devtools endpoint ───────────────────────────────────────
app.route('/devtools', devtools)

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

// ── Scheduled (Cron Trigger) handler ───────────────────────────────────────
export const scheduled: ExportedHandlerScheduledHandler<Env> = async (_event, env, ctx) => {
    ctx.waitUntil(maybeRunAgentMetricsTask(env.DB))
}

export default app