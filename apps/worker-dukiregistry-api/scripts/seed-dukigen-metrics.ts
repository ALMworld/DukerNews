#!/usr/bin/env tsx
/**
 * seed-dukigen-metrics.ts — Seed dukigen_agent_metrics with placeholder
 * credibility values for every known agent, across all four timescales.
 *
 * Idempotent: uses INSERT OR REPLACE on (agent_id, timescale). Re-running
 * regenerates the same numbers because the score is derived from a stable
 * agentId-seeded PRNG (mulberry32). Real values will be written by the
 * indexer/admin pipeline; this is purely so /market has data in dev.
 *
 * Prerequisites:
 *   1. Worker running (pnpm dev) with schemas 001 + 002 applied
 *      (pnpm test:schema)
 *   2. Some agents registered (run scripts/test-e2e-dukigen-sync.ts first
 *      or register via the UI)
 *
 * Usage:
 *   pnpm seed:metrics
 *   # or:
 *   npx tsx scripts/seed-dukigen-metrics.ts
 */

const WORKER_URL = process.env.WORKER_URL ?? 'http://localhost:8788'
const TIMESCALES = ['all', 'year', 'month', 'week'] as const

type Timescale = typeof TIMESCALES[number]

// Same PRNG and proportions the client used to fake before the table existed,
// so the dev experience is unchanged when switching to the real endpoint.
function seeded(agentId: bigint, salt: number): number {
    let a = (Number(agentId & 0xffffffffn) ^ salt) >>> 0
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function credibilityFor(agentId: bigint): Record<Timescale, number> {
    const all = Math.floor(seeded(agentId, 1) * 90_000) + 10_000
    const year = Math.floor(all * (0.4 + seeded(agentId, 2) * 0.4))
    const month = Math.floor(year * (0.2 + seeded(agentId, 3) * 0.4))
    const week = Math.floor(month * (0.15 + seeded(agentId, 4) * 0.4))
    return { all, year, month, week }
}

async function fetchAgentIds(): Promise<bigint[]> {
    const ids: bigint[] = []
    let page = 1
    while (true) {
        const resp = await fetch(`${WORKER_URL}/dukiregistry.DukigenRegistryService/GetAgents`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
            },
            body: JSON.stringify({ page, perPage: 100 }),
        })
        if (!resp.ok) throw new Error(`GetAgents failed: ${resp.status} ${await resp.text()}`)
        const data = await resp.json() as { agents?: { agentId?: string }[] }
        const agents = data.agents ?? []
        if (agents.length === 0) break
        for (const a of agents) if (a.agentId) ids.push(BigInt(a.agentId))
        if (agents.length < 100) break
        page++
    }
    return ids
}

async function seed() {
    const ids = await fetchAgentIds()
    if (ids.length === 0) {
        console.log('[seed-metrics] No agents found — register some first.')
        return
    }
    console.log(`[seed-metrics] Seeding ${ids.length} agents × ${TIMESCALES.length} timescales`)

    // Worker doesn't expose a write endpoint for metrics by design (this is
    // dev-only data). Drop straight into D1 via wrangler.
    const sqlLines: string[] = []
    const now = Math.floor(Date.now() / 1000)
    for (const id of ids) {
        const cred = credibilityFor(id)
        for (const t of TIMESCALES) {
            sqlLines.push(
                `INSERT OR REPLACE INTO dukigen_agent_metrics (agent_id, timescale, credibility, updated_at) VALUES ('${id.toString()}', '${t}', ${cred[t]}, ${now});`
            )
        }
    }

    const sql = sqlLines.join('\n')
    // Write to a temp file the wrangler CLI can consume.
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const tmpPath = path.resolve(process.cwd(), '.seed-metrics.sql')
    await fs.writeFile(tmpPath, sql, 'utf8')

    const { spawn } = await import('node:child_process')
    await new Promise<void>((resolve, reject) => {
        const child = spawn('npx', [
            'wrangler', 'd1', 'execute', 'duki_registry',
            '--local', '--file', tmpPath,
        ], { stdio: 'inherit' })
        child.on('exit', (code) => {
            fs.unlink(tmpPath).catch(() => { })
            code === 0 ? resolve() : reject(new Error(`wrangler exited ${code}`))
        })
    })
    console.log('[seed-metrics] Done.')
}

seed().catch((err) => {
    console.error('[seed-metrics] Failed:', err)
    process.exit(1)
})
