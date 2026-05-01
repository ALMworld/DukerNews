/**
 * agent-metrics-task.ts — Periodic agent DUKI value snapshot.
 *
 * 1. Sums `duki_d6_amount` from `deal_duki_minted_events` per (chain_eid, agent_id)
 *    and upserts the cumulative total into `duki_metrics` (metric_name = 'duki_d6_value').
 *
 * 2. For every agent that had new data, re-aggregates the cross-chain total from
 *    `duki_metrics` and writes `mint_credibility_d6` + `mint_credibility_snapshot`
 *    (a serialized SnapshotValue proto BLOB) back to `dukigen_agents`.
 *
 * Execution is gated to every 64 minutes via a `cron_state` row in D1
 * (no KV namespace needed). The caller (scheduled handler in index.ts)
 * should invoke `maybeRunAgentMetricsTask` on every cron tick.
 */

import { create, toBinary } from '@bufbuild/protobuf'
import { SnapshotValueSchema } from '@repo/dukiregistry-apidefs'
import { getChainConfig, getSupportedChainEids } from '../config'

const JOB_NAME = 'duki_metrics'
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

    // Claim the slot atomically: only update if no one else raced us.
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

// ── Core task ─────────────────────────────────────────────────────────────────

interface AgentMetricRow {
    agent_id: string
    total_duki_d6: number
    max_evt_seq: number
}

/**
 * For a single chain, read all deal_duki_minted_events rows that are newer than
 * the last snapshot, sum duki_d6_amount per agent, then upsert into duki_metrics.
 *
 * Returns the set of agent_ids that had new data written.
 */
async function snapshotChain(
    db: D1Database,
    chainEid: number,
    contractAddr: string,
): Promise<Set<string>> {
    const now = Date.now()   // milliseconds

    // Find the highest evt_seq we already processed for every agent on this chain.
    // Use a single cursor — the minimum last_evt_seq across all agents on this chain.
    const cursorRow = await db
        .prepare(`
            SELECT MIN(last_evt_seq) AS min_seq
            FROM duki_metrics
            WHERE chain_eid = ? AND contract_addr = ? AND metric_name = 'duki_d6_value'
        `)
        .bind(chainEid, contractAddr)
        .first<{ min_seq: number | null }>()

    const fromSeq = cursorRow?.min_seq ?? 0

    // Aggregate new events since fromSeq.
    const { results } = await db
        .prepare(`
            SELECT
                agent_id,
                SUM(duki_d6_amount) AS total_duki_d6,
                MAX(evt_seq)        AS max_evt_seq
            FROM deal_duki_minted_events
            WHERE chain_eid = ?
              AND evt_seq > ?
            GROUP BY agent_id
        `)
        .bind(chainEid, fromSeq)
        .all<AgentMetricRow>()

    if (!results || results.length === 0) return new Set()

    // Upsert each agent row — add the new sum on top of any existing value.
    const stmts = results.map((r) =>
        db.prepare(`
            INSERT INTO duki_metrics
                (chain_eid, contract_addr, agent_id, metric_name, metric_value, last_evt_seq, snapshot_ms)
            VALUES (?, ?, ?, 'duki_d6_value', ?, ?, ?)
            ON CONFLICT(chain_eid, contract_addr, agent_id, metric_name) DO UPDATE SET
                metric_value = metric_value + excluded.metric_value,
                last_evt_seq = excluded.last_evt_seq,
                snapshot_ms  = excluded.snapshot_ms
        `).bind(
            chainEid,
            contractAddr,
            r.agent_id,
            r.total_duki_d6,
            r.max_evt_seq,
            now,
        )
    )

    await db.batch(stmts)

    console.log(
        `[agent-metrics] chain=${chainEid} upserted ${results.length} agent rows` +
        ` (fromSeq=${fromSeq})`,
    )

    return new Set(results.map((r) => r.agent_id))
}

// ── Cross-chain agent update ───────────────────────────────────────────────────

interface AgentTotalRow {
    agent_id: string
    total_d6: number
    max_evt_seq: number
    chain_eid: number   // chain with highest last_evt_seq (used for snapshot)
}

/**
 * For each changed agent, sum metric_value across ALL chains from duki_metrics,
 * build a SnapshotValue proto, then write mint_credibility_d6 and
 * mint_credibility_snapshot to dukigen_agents.
 */
async function updateAgentCredibility(
    db: D1Database,
    agentIds: Set<string>,
): Promise<void> {
    if (agentIds.size === 0) return

    const now = Math.floor(Date.now() / 1000)
    const ids = [...agentIds]

    // Build placeholders: ?,?,?
    const placeholders = ids.map(() => '?').join(',')

    // Sum across all chains; pick the chain_eid of the row with the highest last_evt_seq
    // for the SnapshotValue.chain_eid field.
    const { results } = await db
        .prepare(`
            SELECT
                agent_id,
                SUM(metric_value)  AS total_d6,
                MAX(last_evt_seq)  AS max_evt_seq,
                chain_eid
            FROM duki_metrics
            WHERE metric_name = 'duki_d6_value'
              AND agent_id IN (${placeholders})
            GROUP BY agent_id
        `)
        .bind(...ids)
        .all<AgentTotalRow>()

    if (!results || results.length === 0) return

    const updateStmts = results.map((r) => {
        // Serialize SnapshotValue proto to BLOB.
        const snap = create(SnapshotValueSchema, {
            chainEid: r.chain_eid,
            evtSeq: BigInt(r.max_evt_seq),
            d6Value: BigInt(r.total_d6),
            snapshotTime: BigInt(now),
        })
        const snapBlob = toBinary(SnapshotValueSchema, snap)

        return db
            .prepare(`
                UPDATE dukigen_agents
                SET
                    mint_credibility_d6       = ?,
                    mint_credibility_snapshot = ?,
                    updated_at                = ?
                WHERE agent_id = ?
            `)
            .bind(r.total_d6, snapBlob, now, r.agent_id)
    })

    await db.batch(updateStmts)

    console.log(`[agent-metrics] updated mint_credibility for ${results.length} agents`)
}

// ── Public entry points ───────────────────────────────────────────────────────

/**
 * Core task logic: snapshot all supported chains, then propagate cross-chain
 * totals back to dukigen_agents. No interval gating — always executes.
 *
 * Shared between the cron handler (`maybeRunAgentMetricsTask`) and devtools.
 */
export async function runAgentMetricsTask(db: D1Database): Promise<{
    chainsProcessed: number
    agentsUpdated: number
}> {
    console.log('[agent-metrics] starting snapshot run')

    // Step 1: snapshot each chain, collect all agent_ids that changed.
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
            console.error(`[agent-metrics] chain=${chainEid} error:`, err)
        }
    }

    // Step 2: propagate cross-chain totals to dukigen_agents.
    try {
        await updateAgentCredibility(db, changedAgents)
    } catch (err) {
        console.error('[agent-metrics] updateAgentCredibility error:', err)
    }

    console.log('[agent-metrics] snapshot run complete')
    return { chainsProcessed, agentsUpdated: changedAgents.size }
}

/**
 * Called on every cron tick.  Exits immediately if 64 minutes haven't elapsed
 * since the last successful run.  Otherwise delegates to `runAgentMetricsTask`.
 */
export async function maybeRunAgentMetricsTask(db: D1Database): Promise<void> {
    const shouldRun = await acquireRun(db)
    if (!shouldRun) {
        console.log('[agent-metrics] skipped — interval not elapsed')
        return
    }

    await runAgentMetricsTask(db)
}
