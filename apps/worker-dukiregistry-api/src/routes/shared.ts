
/**
 * grpc.ts — ConnectRPC handlers for DukerRegistryService, DukigenRegistryService,
 * AlmWorldMinterService, and BlockchainSyncService.
 *
 * All notify/sync (chain-ingest) logic is consolidated in BlockchainSyncService.
 * The per-contract services expose query-only RPCs.
 */

import { create } from '@bufbuild/protobuf'
import {
    BlockchainSyncRespSchema,
    DealDukiMintedEventSchema,
    RankedAgentSchema,
    AlmWorldDukiMinterOverviewSchema,
    ChainContractEntrySchema,
} from '@repo/dukiregistry-apidefs'
import {
    DukerIdentitySchema,
    DukigenAgentSchema,
} from '@repo/dukiregistry-apidefs'
import { pullDukigenEventsByBlockRange } from '../services/chain-puller'
import { processDukigenEvents } from '../services/dukigen-event-service'
import {
    pullDealDukiMintedByBlockRange,
    processMinterEvents,
    setLastBlockNumber,
} from '../services/minter-event-service'
import { createPublicClient, http } from 'viem'
import { getChainConfig, getSupportedChainEids } from '../config'
import { dukigenRegistryAbi } from 'contract-duki-alm-world'

// Store reference for context access — set from index.ts
export let _db: D1Database

export function setDb(db: D1Database) {
    _db = db
}








export function parseOpContractsRow(raw: string | null | undefined) {
    if (!raw) return []
    try {
        const arr = JSON.parse(raw)
        if (!Array.isArray(arr)) return []
        return arr.map((c: any) =>
            create(ChainContractEntrySchema, {
                chainEid: Number(c.chainEid ?? 0),
                contractAddr: c.contractAddr ?? '',
            })
        )
    } catch {
        return []
    }
}

// ── Deal id (sortable) ──────────────────────────────────────────────────

/**
 * Build the compact sortable deal id: hex-packed (evt_time:08x)(chain_eid:04x)(evt_seq:016x).
 * Lex order = (evt_time, chain_eid, evt_seq) so events near the same time across chains cluster.
 */
export function buildDealId(evtTime: bigint | number, chainEid: number, evtSeq: bigint | number): string {
    const t = BigInt(evtTime).toString(16).padStart(8, '0')
    const c = BigInt(chainEid).toString(16).padStart(4, '0')
    const s = BigInt(evtSeq).toString(16).padStart(16, '0')
    return t + c + s
}

// ── kv_config helpers ───────────────────────────────────────────────────

/**
 * Read multiple kv_config rows in one query and parse each value as JSON.
 * Missing keys map to `undefined`.
 */
export async function readKvConfigJson(
    db: D1Database,
    keys: string[],
): Promise<Map<string, unknown>> {
    if (keys.length === 0) return new Map()
    const placeholders = keys.map(() => '?').join(',')
    const rows = (await db
        .prepare(`SELECT cfg_key, cfg_json_value FROM kv_config WHERE cfg_key IN (${placeholders})`)
        .bind(...keys)
        .all<{ cfg_key: string; cfg_json_value: string }>()).results ?? []
    const out = new Map<string, unknown>()
    for (const r of rows) {
        try { out.set(r.cfg_key, JSON.parse(r.cfg_json_value)) }
        catch { /* ignore malformed JSON */ }
    }
    return out
}

// ── ListAgentsRanked helpers ────────────────────────────────────────────

export const VALID_TIMESCALES = new Set(['all', 'year', 'month', 'week'])

export function normalizeTimescale(t: string): string {
    const v = (t || '').toLowerCase()
    return VALID_TIMESCALES.has(v) ? v : 'all'
}

type RankCursor = { reputation: number; agentId: string }

// base64url-encoded JSON. agent_id stays a string because dukigen_agents
// stores it as TEXT (uint256 doesn't survive Number).
export function encodeRankCursor(c: RankCursor): string {
    const json = JSON.stringify({ c: c.reputation, a: c.agentId })
    const b64 = btoa(json)
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeRankCursor(raw: string | undefined | null): RankCursor | null {
    if (!raw) return null
    try {
        const padded = raw.replace(/-/g, '+').replace(/_/g, '/')
        const json = atob(padded)
        const obj = JSON.parse(json)
        if (typeof obj?.a !== 'string' || typeof obj?.c !== 'number') return null
        return { reputation: obj.c, agentId: obj.a }
    } catch {
        return null
    }
}

export async function queryRankedAgentRows(db: D1Database, timescale: string, limit: number) {
    const rows = (await db.prepare(
        `SELECT a.*,
                COALESCE(m.reputation, 0) AS metric_reputation,
                COALESCE(m.updated_at, 0) AS metric_updated_at,
                COALESCE(dm.mint_reputation_d6, 0) AS mint_reputation_d6
         FROM   dukigen_agents a
         LEFT JOIN dukigen_agent_metrics m
                ON m.agent_id = a.agent_id AND m.timescale = ?
         LEFT JOIN (
             SELECT agent_id, SUM(total_d6_amount) AS mint_reputation_d6
             FROM dukigen_metrics
             GROUP BY agent_id
         ) dm ON dm.agent_id = a.agent_id
         ORDER BY COALESCE(m.reputation, 0) DESC, a.agent_id DESC
         LIMIT ?`
    ).bind(timescale, limit).all<any>()).results ?? []

    return rows
}

export async function queryMarketQuickTotals(db: D1Database) {
    // Reads everything from dukigen_metrics — one row per (chain_eid, agent_id).
    // total_agents = distinct agent count across chains, total_d6_amount /
    // transactions_count = sum of per-row totals across chains.
    const totals = await db.prepare(
        `SELECT COUNT(DISTINCT agent_id)        AS total_agents,
                COUNT(DISTINCT chain_eid)       AS active_chains,
                COALESCE(SUM(total_d6_amount), 0)    AS total_d6_amount,
                COALESCE(SUM(transactions_count), 0) AS transactions_count
         FROM dukigen_metrics`
    ).first<{
        total_agents?: number
        active_chains?: number
        total_d6_amount?: number
        transactions_count?: number
    }>()

    return {
        totalAgents: Number(totals?.total_agents ?? 0),
        totalD6Amount: BigInt(Math.floor(Number(totals?.total_d6_amount ?? 0))),
        activeChainCount: Number(totals?.active_chains ?? 0),
        transactionsCount: BigInt(Number(totals?.transactions_count ?? 0)),
    }
}

export async function queryChainMinterOverviews(db: D1Database) {
    // Per-chain rollup of the materialised metrics. evt_seq is derived from
    // the largest watermark id (which suffix-encodes evt_seq) — see migration
    // for the format. We expose the raw watermark id alongside it so the
    // frontend can use either.
    const rows = (await db.prepare(
        `SELECT chain_eid,
                COALESCE(SUM(total_d6_amount), 0)        AS total_d6_amount,
                COALESCE(MAX(mint_reputation_snapshot_id), '') AS max_snapshot_id
         FROM dukigen_metrics
         GROUP BY chain_eid`
    ).all<{ chain_eid: number; total_d6_amount?: number; max_snapshot_id?: string }>()).results ?? []

    const byChain = new Map(rows.map((row) => [Number(row.chain_eid), row]))
    const zeroAddress = '0x0000000000000000000000000000000000000000'

    return getSupportedChainEids()
        .map((chainEid) => {
            const cfg = getChainConfig(chainEid)
            if (!cfg.almWorldDukiMinterAddress || cfg.almWorldDukiMinterAddress === zeroAddress) return null
            const row = byChain.get(chainEid)
            // Last 16 hex chars of the deal id encode evt_seq.
            const snapshotId = row?.max_snapshot_id ?? ''
            const evtSeq = snapshotId.length >= 16
                ? BigInt('0x' + snapshotId.slice(-16))
                : 0n
            return create(AlmWorldDukiMinterOverviewSchema, {
                chainEid,
                contractAddr: cfg.almWorldDukiMinterAddress,
                evtSeq,
                totalD6Amount: BigInt(Math.floor(Number(row?.total_d6_amount ?? 0))),
            })
        })
        .filter((item): item is NonNullable<typeof item> => item != null)
}

export function rowToAgent(row: any) {
    return create(DukigenAgentSchema, {
        agentId: BigInt(row.agent_id),
        name: row.name,
        agentUri: row.agent_uri,
        agentUriHash: row.agent_uri_hash ?? '',
        owner: row.owner,
        originChainEid: row.chain_eid,
        approxBps: row.approx_bps ?? 0,
        productType: row.product_type,
        dukiType: row.duki_type,
        opContracts: parseOpContractsRow(row.op_contracts),
        pledgeUrl: row.pledge_url,
        website: row.website ?? '',
        reputationWallet: row.reputation_wallet ?? '',
        reputationD6: BigInt(row.reputation_d6 ?? 0),
        reputationSnapshotMs: BigInt(row.reputation_snapshot_ms ?? 0),
        mintReputationD6: BigInt(row.mint_reputation_d6 ?? 0),
        mintReputationSnapshotId: row.mint_reputation_snapshot_id ?? '',
    })
}

export function rowToRankedAgent(row: any) {
    return create(RankedAgentSchema, {
        agent: rowToAgent(row),
        reputation: BigInt(row.metric_reputation ?? 0),
    })
}




export async function syncDukigenContract(chainEid: number) {
    const lastEvtSeq = await getContinuousDukigenEvtSeq(chainEid)
    const cfg = getChainConfig(chainEid)
    const client = createPublicClient({ transport: http(cfg.rpcUrl) })

    const [chainEvtSeq, checkpoints] = await client.readContract({
        address: cfg.dukigenRegistryAddress,
        abi: dukigenRegistryAbi,
        functionName: 'eventState',
    })

    if (Number(chainEvtSeq) === 0 || Number(chainEvtSeq) <= Number(lastEvtSeq)) {
        return create(BlockchainSyncRespSchema, {
            lastEvtSeq,
            eventsIndexed: 0,
            lastBlockNumber: 0n,
        })
    }

    const fromBlockStart = findBestCheckpoint(checkpoints, Number(lastEvtSeq))
    const latestBlock = await client.getBlockNumber()

    const result = await chunkedSync({
        fromBlock: fromBlockStart,
        latestBlock,
        lastEvtSeq,
        chainEvtSeq: chainEvtSeq as bigint,
        maxBlockRange: 0n,
        pull: (from, to) => pullDukigenEventsByBlockRange(chainEid, from, to),
        process: (evts) => processDukigenEvents(_db, evts),
        getEvtSeq: (e) => e.evtSeq,
    })

    return create(BlockchainSyncRespSchema, {
        lastEvtSeq: result.syncedUpTo,
        eventsIndexed: result.eventsIndexed,
        lastBlockNumber: latestBlock,
    })
}

export async function syncMinterContract(chainEid: number) {
    const cfg = getChainConfig(chainEid)
    if (!cfg.almWorldDukiMinterAddress || cfg.almWorldDukiMinterAddress === '0x0000000000000000000000000000000000000000') {
        return create(BlockchainSyncRespSchema, {
            lastEvtSeq: 0n,
            eventsIndexed: 0,
        })
    }

    const client = createPublicClient({ transport: http(cfg.rpcUrl) })

    const headBlock = await client.getBlockNumber()

    // Resume from D1's last-indexed cursor +1 so we don't re-pull the tail block.
    const syncState = await _db.prepare(
        'SELECT last_block_number, last_evt_seq FROM sync_state WHERE chain_eid = ? AND contract_address = ? COLLATE NOCASE'
    ).bind(chainEid, cfg.almWorldDukiMinterAddress).first<{ last_block_number: number, last_evt_seq: number }>()

    const cursor = BigInt(syncState?.last_block_number ?? 0) + 1n
    let fromBlock = cursor < 1n ? 1n : cursor

    if (fromBlock > headBlock) {
        return create(BlockchainSyncRespSchema, {
            lastEvtSeq: BigInt(syncState?.last_evt_seq ?? 0),
            eventsIndexed: 0,
            lastBlockNumber: headBlock,
        })
    }

    let totalIndexed = 0
    let lastProcessedBlock = fromBlock - 1n
    let lastEvtSeqProcessed = BigInt(syncState?.last_evt_seq ?? 0)
    for (let i = 0; i < MAX_CHUNKS_PER_REQUEST; i++) {
        if (fromBlock > headBlock) break
        const tentativeTo = fromBlock + DEFAULT_MAX_BLOCK_RANGE - 1n
        const toBlock = tentativeTo < headBlock ? tentativeTo : headBlock

        const events = await pullDealDukiMintedByBlockRange(chainEid, fromBlock, toBlock)
        if (events.length > 0) {
            await processMinterEvents(_db, events)
            totalIndexed += events.length
            lastEvtSeqProcessed = events[events.length - 1].evtSeq
        }
        lastProcessedBlock = toBlock
        fromBlock = toBlock + 1n
    }

    await setLastBlockNumber(_db, chainEid, cfg.almWorldDukiMinterAddress, lastProcessedBlock, lastEvtSeqProcessed)
    return create(BlockchainSyncRespSchema, {
        lastEvtSeq: lastEvtSeqProcessed,
        eventsIndexed: totalIndexed,
        lastBlockNumber: lastProcessedBlock,
    })
}

// ── Minter helpers ──────────────────────────────────────────────────────

// toDealDukiMintedProto removed — pullMinterEventsFromTx now returns DealDukiMintedEvent directly.

type DealCursor = { blockNumber: number; evtSeq: number }

export function encodeDealCursor(c: DealCursor): string {
    return btoa(JSON.stringify({ b: c.blockNumber, s: c.evtSeq }))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeDealCursor(raw: string | undefined | null): DealCursor | null {
    if (!raw) return null
    try {
        const padded = raw.replace(/-/g, '+').replace(/_/g, '/')
        const obj = JSON.parse(atob(padded))
        if (typeof obj?.b !== 'number' || typeof obj?.s !== 'number') return null
        return { blockNumber: obj.b, evtSeq: obj.s }
    } catch {
        return null
    }
}

interface QueryDealsArgs {
    agentId: string | null   // null = all agents (recent feed)
    wallet?: string           // filter by minter or yang_receiver
    chainEid: number          // 0 = all chains
    cursor: string
    limit: number
}

export async function queryDeals(db: D1Database, args: QueryDealsArgs) {
    const limit = Math.min(100, Math.max(1, args.limit || 20))
    const cursor = decodeDealCursor(args.cursor)

    // Compound-key keyset pagination: rows strictly before (block_number, evt_seq)
    // come next. block_number breaks ties between agents on the same chain.
    const where: string[] = []
    const params: unknown[] = []
    if (args.agentId !== null) {
        where.push('agent_id = ?')
        params.push(args.agentId)
    }
    if (args.wallet) {
        where.push('(minter = ? COLLATE NOCASE OR yang_receiver = ? COLLATE NOCASE)')
        params.push(args.wallet, args.wallet)
    }
    if (args.chainEid > 0) {
        where.push('chain_eid = ?')
        params.push(args.chainEid)
    }
    if (cursor) {
        where.push('(block_number < ? OR (block_number = ? AND evt_seq < ?))')
        params.push(cursor.blockNumber, cursor.blockNumber, cursor.evtSeq)
    }

    const sql = `
        SELECT id, chain_eid, evt_seq, tx_hash, block_number, evt_time,
               yang_receiver, yin_receiver, stablecoin,
               duki_amount, alm_yang_amount, alm_yin_amount,
               minter, agent_id
        FROM   deal_duki_minted_events
        ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY block_number DESC, evt_seq DESC
        LIMIT ?
    `
    const rows = (await db.prepare(sql).bind(...params, limit + 1).all<any>()).results ?? []

    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows
    const events = pageRows.map((r: any) =>
        create(DealDukiMintedEventSchema, {
            id: r.id ?? '',
            chainEid: r.chain_eid,
            evtSeq: BigInt(r.evt_seq),
            txHash: r.tx_hash,
            blockNumber: BigInt(r.block_number),
            evtTime: BigInt(r.evt_time),
            yangReceiver: r.yang_receiver,
            yinReceiver: r.yin_receiver,
            stablecoin: r.stablecoin,
            dukiAmount: r.duki_amount,
            almYangAmount: r.alm_yang_amount,
            almYinAmount: r.alm_yin_amount,
            minter: r.minter,
            agentId: BigInt(r.agent_id),
        })
    )

    const last = pageRows[pageRows.length - 1]
    const nextCursor = hasMore && last
        ? encodeDealCursor({ blockNumber: Number(last.block_number), evtSeq: Number(last.evt_seq) })
        : ''

    return { events, nextCursor, hasMore }
}

// ── Helpers ──────────────────────────────────────────────────

export function rowToIdentity(row: any) {
    return create(DukerIdentitySchema, {
        username: row.username,
        chainEid: row.chain_eid,
        tokenId: row.token_id,
        ego: row.ego,
        bio: row.bio ?? '',
        website: row.website ?? '',
    })
}

/**
 * Find the best (lowest) block number from checkpoints that covers
 * events after lastEvtSeq. Falls back to the earliest non-zero checkpoint.
 */
export function findBestCheckpoint(checkpoints: readonly bigint[], lastEvtSeq: number): bigint {
    // The checkpoint at slot i covers events starting at evtSeq = i*64 + 1
    // Find the slot that contains lastEvtSeq
    const targetSlot = lastEvtSeq > 0 ? Math.floor((lastEvtSeq - 1) / 64) % 4 : 0

    // Try the target slot's checkpoint first
    if (checkpoints[targetSlot] > 0n) return checkpoints[targetSlot]

    // Fallback: use the earliest non-zero checkpoint
    let earliest = 0n
    for (const cp of checkpoints) {
        if (cp > 0n && (earliest === 0n || cp < earliest)) earliest = cp
    }
    return earliest > 0n ? earliest : 0n
}

/**
 * Largest evt_seq N such that all of 1..N are present in the events table for
 * the given chain. If MIN(evt_seq) > 1 the continuous prefix is empty (0).
 * Used so sync resumes from the highest gap-free point, not from a value with
 * holes underneath it.
 */
export async function getContinuousDukerEvtSeq(chainEid: number): Promise<bigint> {
    return getContinuousEvtSeq('duker_registry_events', chainEid)
}

export async function getContinuousDukigenEvtSeq(chainEid: number): Promise<bigint> {
    return getContinuousEvtSeq('dukigen_registry_events', chainEid)
}

export async function getContinuousEvtSeq(table: string, chainEid: number): Promise<bigint> {
    const minRow = await _db.prepare(
        `SELECT COALESCE(MIN(evt_seq), 0) AS m FROM ${table} WHERE chain_eid = ?`
    ).bind(chainEid).first<{ m?: number | string | null }>()
    const min = Number(minRow?.m ?? 0)
    if (min === 0 || min > 1) return 0n

    const gapRow = await _db.prepare(
        `SELECT MIN(e1.evt_seq) AS s
         FROM ${table} e1
         WHERE e1.chain_eid = ?
           AND NOT EXISTS (
             SELECT 1 FROM ${table} e2
             WHERE e2.chain_eid = e1.chain_eid AND e2.evt_seq = e1.evt_seq + 1
           )`
    ).bind(chainEid).first<{ s?: number | string | null }>()
    return BigInt(gapRow?.s ?? 0)
}

interface ChunkedSyncArgs<E> {
    fromBlock: bigint
    latestBlock: bigint
    lastEvtSeq: bigint
    chainEvtSeq: bigint
    maxBlockRange: bigint
    pull: (from: bigint, to: bigint) => Promise<E[]>
    process: (events: E[]) => Promise<void>
    getEvtSeq: (e: E) => bigint
}

interface ChunkedSyncResult {
    syncedUpTo: bigint
    eventsIndexed: number
}

export const DEFAULT_MAX_BLOCK_RANGE = 10000n
export const MAX_CHUNKS_PER_REQUEST = 20

/**
 * Walk [fromBlock..latestBlock] in chunks of `maxBlockRange`, pulling logs and
 * applying any events whose evtSeq is past `lastEvtSeq`. Stops early once
 * caught up to `chainEvtSeq` or after MAX_CHUNKS_PER_REQUEST iterations — the
 * caller re-invokes to continue. Lets RPCs that cap getLogs at small ranges
 * (e.g. 50 blocks) still make progress under a single Worker request budget.
 */
export async function chunkedSync<E>(args: ChunkedSyncArgs<E>): Promise<ChunkedSyncResult> {
    const maxRange = args.maxBlockRange > 0n ? args.maxBlockRange : DEFAULT_MAX_BLOCK_RANGE
    let fromBlock = args.fromBlock
    let currentLastEvtSeq = args.lastEvtSeq
    let totalIndexed = 0

    if (fromBlock === 0n) fromBlock = 1n

    for (let i = 0; i < MAX_CHUNKS_PER_REQUEST; i++) {
        if (fromBlock > args.latestBlock) break
        const tentativeTo = fromBlock + maxRange - 1n
        const toBlock = tentativeTo < args.latestBlock ? tentativeTo : args.latestBlock

        const events = await args.pull(fromBlock, toBlock)
        const newEvents = events
            .filter(e => args.getEvtSeq(e) > currentLastEvtSeq)
            .sort((a, b) => Number(args.getEvtSeq(a) - args.getEvtSeq(b)))

        if (newEvents.length > 0) {
            await args.process(newEvents)
            totalIndexed += newEvents.length
            currentLastEvtSeq = args.getEvtSeq(newEvents[newEvents.length - 1])
        }

        if (currentLastEvtSeq >= args.chainEvtSeq) break
        fromBlock = toBlock + 1n
    }

    return { syncedUpTo: currentLastEvtSeq, eventsIndexed: totalIndexed }
}

