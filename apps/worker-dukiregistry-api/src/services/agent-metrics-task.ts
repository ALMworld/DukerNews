/**
 * agent-metrics-task.ts — Periodic dukigen_metrics snapshot.
 *
 * 1. For every chain, scans `deal_duki_minted_events` rows whose `id` is
 *    strictly greater than the per-(chain, agent) watermark stored in
 *    `dukigen_metrics.mint_reputation_snapshot_id`. Groups by `agent_id`,
 *    accumulates `total_d6_amount` (sum of `duki_d6_amount`) and
 *    `transactions_count` (count of deals), and advances the watermark to
 *    `MAX(deal.id)` for that group.
 *
 * 2. For every agent that had new data, re-aggregates the cross-chain total
 *    from `dukigen_metrics` and writes `mint_reputation_d6` +
 *    `mint_reputation_snapshot_id` (the highest watermark across chains)
 *    back to `dukigen_agents`.
 *
 * Execution is gated to every 64 minutes via a `cron_state` row in D1.
 */

import { getChainConfig, getSupportedChainEids } from '../config'

const JOB_NAME = 'dukigen_metrics'
const INTERVAL_MS = 64 * 60 * 1000   // 64 minutes

// ── Interval gate ─────────────────────────────────────────────────────────────

/** Returns true and updates last_run_at if the 64-min window has elapsed. */
async function acquireRun(db: D1Database): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000)
    const row = await db
        .prepare('SELECT last_run_at FROM cron_state WHERE job_name = ?')
        .bind(JOB_NAME)
        .first<{ last_run_at: number }>()

    const lastRun = row?.last_run_at ?? 0
    if ((now - lastRun) * 1000 < INTERVAL_MS) return false

    await db
        .prepare(`
            INSERT INTO cron_state (job_name, last_run_at) VALUES (?, ?)
            ON CONFLICT(job_name) DO UPDATE SET last_run_at = excluded.last_run_at
                WHERE last_run_at = ?
        `)
        .bind(JOB_NAME, now, lastRun)
        .run()

    return true
}

// ── Per-chain incremental snapshot ─────────────────────────────────────────────

interface AgentDeltaRow {
    agent_id: string
    delta_d6: number
    delta_count: number
    max_id: string
}

/**
 * For one chain, read deals whose id > per-agent watermark, group by agent,
 * upsert the new totals into dukigen_metrics. Returns the agent_ids touched.
 *
 * Watermark semantics: each (chain_eid, agent_id) row tracks its own
 * mint_reputation_snapshot_id. To avoid scanning the entire deal table per
 * agent, we use the chain-wide MIN watermark as a cutoff and rely on the
 * per-agent comparison in the GROUP BY's filter to ignore already-counted
 * deals.
 */
async function snapshotChain(
    db: D1Database,
    chainEid: number,
    contractAddr: string,
): Promise<Set<string>> {
    const now = Date.now()

    const cursorRow = await db
        .prepare(`SELECT MIN(mint_reputation_snapshot_id) AS min_id FROM dukigen_metrics WHERE chain_eid = ?`)
        .bind(chainEid)
        .first<{ min_id: string | null }>()

    const fromId = cursorRow?.min_id ?? ''

    // Per-agent existing watermarks for this chain.
    const existing = (await db
        .prepare(`SELECT agent_id, mint_reputation_snapshot_id AS wm FROM dukigen_metrics WHERE chain_eid = ?`)
        .bind(chainEid)
        .all<{ agent_id: string; wm: string }>()).results ?? []
    const wmByAgent = new Map(existing.map((r) => [r.agent_id, r.wm ?? '']))

    // Pull all candidate deals past the chain-wide cutoff. With an indexed scan
    // on (chain_eid, id) this is one range read; we then filter per-agent in
    // app code (deals/agent are small in any sane window).
    const rows = (await db
        .prepare(`
            SELECT id, agent_id, duki_d6_amount
            FROM deal_duki_minted_events
            WHERE chain_eid = ? AND id > ?
        `)
        .bind(chainEid, fromId)
        .all<{ id: string; agent_id: string; duki_d6_amount: number }>()).results ?? []

    const byAgent = new Map<string, AgentDeltaRow>()
    for (const r of rows) {
        const wm = wmByAgent.get(r.agent_id) ?? ''
        if (r.id <= wm) continue
        const cur = byAgent.get(r.agent_id) ?? {
            agent_id: r.agent_id, delta_d6: 0, delta_count: 0, max_id: '',
        }
        cur.delta_d6 += Number(r.duki_d6_amount ?? 0)
        cur.delta_count += 1
        if (r.id > cur.max_id) cur.max_id = r.id
        byAgent.set(r.agent_id, cur)
    }

    if (byAgent.size === 0) return new Set()

    const stmts = [...byAgent.values()].map((r) =>
        db.prepare(`
            INSERT INTO dukigen_metrics
                (chain_eid, agent_id, contract_addr, total_d6_amount,
                 transactions_count, mint_reputation_snapshot_id, snapshot_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(chain_eid, agent_id) DO UPDATE SET
                total_d6_amount             = total_d6_amount + excluded.total_d6_amount,
                transactions_count          = transactions_count + excluded.transactions_count,
                mint_reputation_snapshot_id = excluded.mint_reputation_snapshot_id,
                snapshot_ms                 = excluded.snapshot_ms,
                contract_addr               = excluded.contract_addr
        `).bind(
            chainEid,
            r.agent_id,
            contractAddr,
            r.delta_d6,
            r.delta_count,
            r.max_id,
            now,
        )
    )

    await db.batch(stmts)

    console.log(
        `[dukigen-metrics] chain=${chainEid} upserted ${byAgent.size} agent rows (fromId=${fromId})`
    )

    return new Set(byAgent.keys())
}

// ── Cross-chain agent rollup ───────────────────────────────────────────────────

interface AgentTotalRow {
    agent_id: string
    total_d6: number
    max_snapshot_id: string
}

/**
 * For each changed agent, sum total_d6_amount across all chains and write
 * mint_reputation_d6 + mint_reputation_snapshot_id back to dukigen_agents.
 */
async function rollupAgentReputation(
    db: D1Database,
    agentIds: Set<string>,
): Promise<void> {
    if (agentIds.size === 0) return

    const now = Math.floor(Date.now() / 1000)
    const ids = [...agentIds]
    const placeholders = ids.map(() => '?').join(',')

    const { results } = await db
        .prepare(`
            SELECT agent_id,
                   SUM(total_d6_amount)                AS total_d6,
                   MAX(mint_reputation_snapshot_id)    AS max_snapshot_id
            FROM dukigen_metrics
            WHERE agent_id IN (${placeholders})
            GROUP BY agent_id
        `)
        .bind(...ids)
        .all<AgentTotalRow>()

    if (!results || results.length === 0) return

    const updateStmts = results.map((r) =>
        db.prepare(`
            UPDATE dukigen_agents
            SET mint_reputation_d6          = ?,
                mint_reputation_snapshot_id = ?,
                updated_at                  = ?
            WHERE agent_id = ?
        `).bind(
            Number(r.total_d6 ?? 0),
            r.max_snapshot_id ?? '',
            now,
            r.agent_id,
        )
    )

    await db.batch(updateStmts)

    console.log(`[dukigen-metrics] rolled up mint_reputation for ${results.length} agents`)
}

// ── Public entry points ───────────────────────────────────────────────────────

export async function runAgentMetricsTask(db: D1Database): Promise<{
    chainsProcessed: number
    agentsUpdated: number
}> {
    console.log('[dukigen-metrics] starting snapshot run')

    const changedAgents = new Set<string>()
    const chainEids = getSupportedChainEids()
    let chainsProcessed = 0

    for (const chainEid of chainEids) {
        try {
            const cfg = getChainConfig(chainEid)
            const contractAddr = cfg.almWorldDukiMinterAddress
            if (!contractAddr || contractAddr === '0x0000000000000000000000000000000000000000') {
                continue
            }
            const updated = await snapshotChain(db, chainEid, contractAddr)
            for (const id of updated) changedAgents.add(id)
            chainsProcessed++
        } catch (err) {
            console.error(`[dukigen-metrics] chain=${chainEid} error:`, err)
        }
    }

    try {
        await rollupAgentReputation(db, changedAgents)
    } catch (err) {
        console.error('[dukigen-metrics] rollupAgentReputation error:', err)
    }

    console.log('[dukigen-metrics] snapshot run complete')
    return { chainsProcessed, agentsUpdated: changedAgents.size }
}

export async function maybeRunAgentMetricsTask(db: D1Database): Promise<void> {
    const shouldRun = await acquireRun(db)
    if (!shouldRun) {
        console.log('[dukigen-metrics] skipped — interval not elapsed')
        return
    }
    await runAgentMetricsTask(db)
}
