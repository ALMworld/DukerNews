/**
 * devtools.ts — Internal devtools endpoint for operational tasks.
 *
 * Request format:  POST /devtools  { "case": "xxx", "data": {} }
 *
 * Auth:
 *  - Dev environment (ENVIRONMENT !== 'production'): open, no auth required.
 *  - Production: requires `x-devtools-token` header.
 *    Token = base64( secret + ":" + unix_timestamp_seconds )
 *    Valid if secret matches DEVTOOLS_SECRET and timestamp is within 5 minutes.
 */

import { Hono } from 'hono'
import type { App } from '../context'
import { runAgentMetricsTask } from '../services/agent-metrics-task'

const TOKEN_WINDOW_SEC = 5 * 60  // 5-minute replay window

// ── Token verification ────────────────────────────────────────────────────────

function verifyDevtoolsToken(token: string, secret: string): boolean {
    try {
        const decoded = atob(token)
        const sepIdx = decoded.lastIndexOf(':')
        if (sepIdx < 0) return false

        const tokenSecret = decoded.slice(0, sepIdx)
        const tokenTime = Number(decoded.slice(sepIdx + 1))

        if (tokenSecret !== secret) return false
        if (Number.isNaN(tokenTime)) return false

        const now = Math.floor(Date.now() / 1000)
        return Math.abs(now - tokenTime) <= TOKEN_WINDOW_SEC
    } catch {
        return false
    }
}

// ── Route ─────────────────────────────────────────────────────────────────────

const devtools = new Hono<App>()

// Auth middleware — open in dev, token-gated in production.
// .dev.vars sets ENVIRONMENT=development; wrangler.jsonc vars set it to "production".
devtools.use('*', async (c, next) => {
    const isDev = (c.env.ENVIRONMENT ?? '') !== 'production'

    if (!isDev) {
        const secret = c.env.DEVTOOLS_SECRET
        if (!secret) {
            return c.json({ ok: false, error: 'devtools not configured' }, 403)
        }
        const token = c.req.header('x-devtools-token') ?? ''
        if (!verifyDevtoolsToken(token, secret)) {
            return c.json({ ok: false, error: 'invalid or expired token' }, 401)
        }
    }

    await next()
})

// Dispatch on { case, data }
devtools.post('/', async (c) => {
    let body: { case: string; data?: Record<string, unknown> }
    try {
        body = await c.req.json()
    } catch {
        return c.json({ ok: false, error: 'invalid JSON body' }, 400)
    }

    if (!body.case || typeof body.case !== 'string') {
        return c.json({ ok: false, error: 'missing "case" field' }, 400)
    }

    switch (body.case) {
        case 'run_agent_metrics': {
            const result = await runAgentMetricsTask(c.env.DB)
            return c.json({ ok: true, case: body.case, result })
        }

        case 'debug_state': {
            // Show chain configs + DB counters to diagnose zero results
            const { getChainConfig, getSupportedChainEids } = await import('../config')
            const zeroAddr = '0x0000000000000000000000000000000000000000'
            const chainEids = getSupportedChainEids()

            const chains = chainEids.map((eid) => {
                try {
                    const cfg = getChainConfig(eid)
                    return {
                        chainEid: eid,
                        minterAddr: cfg.almWorldDukiMinterAddress,
                        skipped: !cfg.almWorldDukiMinterAddress || cfg.almWorldDukiMinterAddress === zeroAddr,
                    }
                } catch {
                    return { chainEid: eid, error: 'config missing' }
                }
            })

            const [eventsCount, metricsCount] = await Promise.all([
                c.env.DB.prepare('SELECT COUNT(*) AS n FROM deal_duki_minted_events').first<{ n: number }>(),
                c.env.DB.prepare('SELECT COUNT(*) AS n FROM duki_metrics').first<{ n: number }>(),
            ])

            const cursors = (await c.env.DB.prepare(
                `SELECT chain_eid, contract_addr, agent_id, last_evt_seq, snapshot_ms
                 FROM duki_metrics WHERE metric_name = 'duki_d6_value' LIMIT 20`
            ).all<any>()).results ?? []

            return c.json({
                ok: true,
                case: body.case,
                result: {
                    chains,
                    db: {
                        deal_duki_minted_events: eventsCount?.n ?? 0,
                        duki_metrics: metricsCount?.n ?? 0,
                    },
                    cursors,
                },
            })
        }

        default:
            return c.json({ ok: false, error: `unknown case: ${body.case}` }, 400)
    }
})

export { devtools }
