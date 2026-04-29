/**
 * grpc.ts — ConnectRPC handlers for DukerRegistryService + DukigenRegistryService.
 */

import type { ConnectRouter } from '@connectrpc/connect'
import { create } from '@bufbuild/protobuf'
import {
    DukerRegistryService,
    DukigenRegistryService,
    AlmWorldMinterService,
    GetUsernameRespSchema,
    CheckUsernameRespSchema,
    NotifyDukerTxRespSchema,
    NotifyDukigenTxRespSchema,
    NotifyMinterTxRespSchema,
    SyncMinterEventsRespSchema,
    GetAgentDealsRespSchema,
    GetRecentDealsRespSchema,
    GetWalletDealsRespSchema,
    DealDukiMintedEventSchema,
    GetAgentsRespSchema,
    ListAgentsRankedRespSchema,
    RankedAgentSchema,
    SyncEventsRespSchema,
    ChainContractEntrySchema,
} from '@repo/dukiregistry-apidefs'
import {
    DukerIdentitySchema,
    DukigenAgentSchema,
} from '@repo/dukiregistry-apidefs'
import { pullTxReceipt, pullDukerEventsByBlockRange, pullDukigenEventsByBlockRange } from '../services/chain-puller'
import { processDukerEvents } from '../services/duker-event-service'
import { processDukigenEvents } from '../services/dukigen-event-service'
import {
    pullMinterEventsFromTx,
    pullDealDukiMintedByBlockRange,
    processMinterEvents,
    getLastBlockIndexed,
    setLastBlockIndexed,
    type PulledDealDukiMintedEvent,
} from '../services/minter-event-service'
import { createPublicClient, http } from 'viem'
import { getChainConfig } from '../config'
import { dukerRegistryAbi, dukigenRegistryAbi } from 'contract-duki-alm-world'

// Store reference for context access — set from index.ts
let _db: D1Database

export function setDb(db: D1Database) {
    _db = db
}








/**
 * Parse the op_contracts JSON column into proto ChainContractEntry[].
 * Tolerates missing/null/malformed JSON — never throws.
 */
function parseOpContractsRow(raw: string | null | undefined) {
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

// ── ListAgentsRanked helpers ────────────────────────────────────────────

const VALID_TIMESCALES = new Set(['all', 'year', 'month', 'week'])

function normalizeTimescale(t: string): string {
    const v = (t || '').toLowerCase()
    return VALID_TIMESCALES.has(v) ? v : 'all'
}

type RankCursor = { credibility: number; agentId: string }

// base64url-encoded JSON. agent_id stays a string because dukigen_agents
// stores it as TEXT (uint256 doesn't survive Number).
function encodeRankCursor(c: RankCursor): string {
    const json = JSON.stringify({ c: c.credibility, a: c.agentId })
    const b64 = btoa(json)
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeRankCursor(raw: string | undefined | null): RankCursor | null {
    if (!raw) return null
    try {
        const padded = raw.replace(/-/g, '+').replace(/_/g, '/')
        const json = atob(padded)
        const obj = JSON.parse(json)
        if (typeof obj?.a !== 'string' || typeof obj?.c !== 'number') return null
        return { credibility: obj.c, agentId: obj.a }
    } catch {
        return null
    }
}


export function registerGrpcRoutes(router: ConnectRouter) {
    // ── DukerRegistryService ────────────────────────────────

    router.service(DukerRegistryService, {
        async getUsername(req) {
            let query = 'SELECT * FROM duker_users WHERE ego = ? COLLATE NOCASE AND status = ?'
            const params: any[] = [req.address, 'active']

            if (req.chainEid > 0) {
                query += ' AND chain_eid = ?'
                params.push(req.chainEid)
            }
            query += ' ORDER BY chain_eid ASC'

            const result = await _db.prepare(query).bind(...params).all<any>()
            return create(GetUsernameRespSchema, {
                identities: (result.results ?? []).map(rowToIdentity),
            })
        },

        async checkUsername(req) {
            const row = await _db.prepare(
                'SELECT * FROM duker_users WHERE username = ? COLLATE NOCASE AND status = ? LIMIT 1'
            ).bind(req.username, 'active').first<any>()

            if (row) {
                return create(CheckUsernameRespSchema, {
                    available: false,
                    owner: rowToIdentity(row),
                })
            }
            return create(CheckUsernameRespSchema, { available: true })
        },

        async getIdentitiesByToken(req) {
            const result = await _db.prepare(
                'SELECT * FROM duker_users WHERE token_id = ? AND status = ? ORDER BY chain_eid ASC'
            ).bind(req.tokenId, 'active').all<any>()

            return create(GetUsernameRespSchema, {
                identities: (result.results ?? []).map(rowToIdentity),
            })
        },

        async notifyDukerTx(req) {
            const resp = create(NotifyDukerTxRespSchema, {})

            const pulled = await pullTxReceipt(req.chainEid, req.txHash)
            await processDukerEvents(_db, pulled.dukerEvents)

            // Events from chain-puller are already fully-typed proto messages
            resp.events = pulled.dukerEvents
            return resp
        },

        async syncDukerEvents(req) {
            const lastEvtSeq = req.lastEvtSeq > 0n
                ? req.lastEvtSeq
                : await getContinuousDukerEvtSeq(req.chainEid)
            const cfg = getChainConfig(req.chainEid)
            const client = createPublicClient({ transport: http(cfg.rpcUrl) })

            const [chainEvtSeq, checkpoints] = await client.readContract({
                address: cfg.dukerRegistryAddress,
                abi: dukerRegistryAbi,
                functionName: 'eventState',
            })

            if (Number(chainEvtSeq) === 0 || Number(chainEvtSeq) <= Number(lastEvtSeq)) {
                return create(SyncEventsRespSchema, {
                    syncedUpTo: lastEvtSeq,
                    eventsIndexed: 0,
                    chainEvtSeq: chainEvtSeq as bigint,
                })
            }

            const fromBlockStart = findBestCheckpoint(checkpoints, Number(lastEvtSeq))
            const latestBlock = await client.getBlockNumber()

            const result = await chunkedSync({
                fromBlock: fromBlockStart,
                latestBlock,
                lastEvtSeq,
                chainEvtSeq: chainEvtSeq as bigint,
                maxBlockRange: req.maxBlockRange,
                pull: (from, to) => pullDukerEventsByBlockRange(req.chainEid, from, to),
                process: (evts) => processDukerEvents(_db, evts),
                getEvtSeq: (e) => e.evtSeq,
            })

            return create(SyncEventsRespSchema, {
                syncedUpTo: result.syncedUpTo,
                eventsIndexed: result.eventsIndexed,
                chainEvtSeq: chainEvtSeq as bigint,
            })
        },
    })

    // ── DukigenRegistryService ───────────────────────────────

    router.service(DukigenRegistryService, {
        async getAgent(req) {
            const row = await _db.prepare(
                'SELECT * FROM dukigen_agents WHERE agent_id = ?'
            ).bind(req.agentId.toString()).first<any>()

            if (!row) {
                return create(DukigenAgentSchema, {})
            }

            return create(DukigenAgentSchema, {
                agentId: BigInt(row.agent_id),
                name: row.name,
                agentUri: row.agent_uri,
                agentUriHash: row.agent_uri_hash ?? '',
                owner: row.owner,
                originChainEid: row.origin_chain_eid,
                approxBps: row.approx_bps ?? row.default_duki_bps ?? 0,
                productType: row.product_type,
                dukiType: row.duki_type,
                pledgeUrl: row.pledge_url,
                website: row.website ?? '',
                credibilityWallet: row.credibility_wallet ?? '',
                opContracts: parseOpContractsRow(row.op_contracts),
            })
        },

        async getAgents(req) {
            const page = Math.max(1, req.page || 1)
            const perPage = Math.min(100, Math.max(1, req.perPage || 20))
            const offset = (page - 1) * perPage

            const countResult = await _db.prepare('SELECT COUNT(*) as cnt FROM dukigen_agents').first<any>()
            const total = countResult?.cnt ?? 0

            const rows = await _db.prepare(
                'SELECT * FROM dukigen_agents ORDER BY created_at DESC LIMIT ? OFFSET ?'
            ).bind(perPage, offset).all<any>()

            return create(GetAgentsRespSchema, {
                total,
                agents: (rows.results ?? []).map((row: any) =>
                    create(DukigenAgentSchema, {
                        agentId: BigInt(row.agent_id),
                        name: row.name,
                        agentUri: row.agent_uri,
                        agentUriHash: row.agent_uri_hash ?? '',
                        owner: row.owner,
                        originChainEid: row.origin_chain_eid,
                        approxBps: row.approx_bps ?? row.default_duki_bps ?? 0,
                        productType: row.product_type,
                        dukiType: row.duki_type,
                        opContracts: parseOpContractsRow(row.op_contracts),
                        pledgeUrl: row.pledge_url,
                        website: row.website ?? '',
                        credibilityWallet: row.credibility_wallet ?? '',
                    })
                ),
            })
        },

        async listAgentsRanked(req) {
            const timescale = normalizeTimescale(req.timescale)
            const limit = Math.min(100, Math.max(1, req.limit || 50))
            const cursor = decodeRankCursor(req.cursor)

            // Compound-key keyset pagination: rows with (credibility, agent_id)
            // strictly less than the cursor's pair come next. agent_id breaks
            // credibility ties so duplicates and skips are impossible across
            // pages, even when many agents share the same score.
            const sql = cursor
                ? `SELECT a.*, m.credibility AS metric_credibility
                   FROM   dukigen_agent_metrics m
                   JOIN   dukigen_agents a ON a.agent_id = m.agent_id
                   WHERE  m.timescale = ?
                     AND  (m.credibility < ?
                           OR (m.credibility = ? AND m.agent_id < ?))
                   ORDER BY m.credibility DESC, m.agent_id DESC
                   LIMIT ?`
                : `SELECT a.*, m.credibility AS metric_credibility
                   FROM   dukigen_agent_metrics m
                   JOIN   dukigen_agents a ON a.agent_id = m.agent_id
                   WHERE  m.timescale = ?
                   ORDER BY m.credibility DESC, m.agent_id DESC
                   LIMIT ?`

            const stmt = cursor
                ? _db.prepare(sql).bind(
                    timescale,
                    cursor.credibility, cursor.credibility, cursor.agentId,
                    limit + 1,
                )
                : _db.prepare(sql).bind(timescale, limit + 1)

            const rows = (await stmt.all<any>()).results ?? []

            const hasMore = rows.length > limit
            const pageRows = hasMore ? rows.slice(0, limit) : rows

            const items = pageRows.map((row: any) =>
                create(RankedAgentSchema, {
                    agent: create(DukigenAgentSchema, {
                        agentId: BigInt(row.agent_id),
                        name: row.name,
                        agentUri: row.agent_uri,
                        agentUriHash: row.agent_uri_hash ?? '',
                        owner: row.owner,
                        originChainEid: row.origin_chain_eid,
                        approxBps: row.approx_bps ?? row.default_duki_bps ?? 0,
                        productType: row.product_type,
                        dukiType: row.duki_type,
                        opContracts: parseOpContractsRow(row.op_contracts),
                        pledgeUrl: row.pledge_url,
                        website: row.website ?? '',
                        credibilityWallet: row.credibility_wallet ?? '',
                    }),
                    credibility: BigInt(row.metric_credibility ?? 0),
                })
            )

            const last = pageRows[pageRows.length - 1]
            const nextCursor = hasMore && last
                ? encodeRankCursor({
                    credibility: Number(last.metric_credibility ?? 0),
                    agentId: String(last.agent_id),
                })
                : ''

            return create(ListAgentsRankedRespSchema, {
                items,
                nextCursor,
                hasMore,
            })
        },

        async notifyDukigenTx(req) {
            const resp = create(NotifyDukigenTxRespSchema, {})

            const pulled = await pullTxReceipt(req.chainEid, req.txHash)
            await processDukigenEvents(_db, pulled.dukigenEvents)

            // Events from chain-puller are already fully-typed proto messages
            resp.events = pulled.dukigenEvents
            return resp
        },

        async syncDukigenEvents(req) {
            const lastEvtSeq = req.lastEvtSeq > 0n
                ? req.lastEvtSeq
                : await getContinuousDukigenEvtSeq(req.chainEid)
            const cfg = getChainConfig(req.chainEid)
            const client = createPublicClient({ transport: http(cfg.rpcUrl) })

            const [chainEvtSeq, checkpoints] = await client.readContract({
                address: cfg.dukigenRegistryAddress,
                abi: dukigenRegistryAbi,
                functionName: 'eventState',
            })

            if (Number(chainEvtSeq) === 0 || Number(chainEvtSeq) <= Number(lastEvtSeq)) {
                return create(SyncEventsRespSchema, {
                    syncedUpTo: lastEvtSeq,
                    eventsIndexed: 0,
                    chainEvtSeq: chainEvtSeq as bigint,
                })
            }

            const fromBlockStart = findBestCheckpoint(checkpoints, Number(lastEvtSeq))
            const latestBlock = await client.getBlockNumber()

            const result = await chunkedSync({
                fromBlock: fromBlockStart,
                latestBlock,
                lastEvtSeq,
                chainEvtSeq: chainEvtSeq as bigint,
                maxBlockRange: req.maxBlockRange,
                pull: (from, to) => pullDukigenEventsByBlockRange(req.chainEid, from, to),
                process: (evts) => processDukigenEvents(_db, evts),
                getEvtSeq: (e) => e.evtSeq,
            })

            return create(SyncEventsRespSchema, {
                syncedUpTo: result.syncedUpTo,
                eventsIndexed: result.eventsIndexed,
                chainEvtSeq: chainEvtSeq as bigint,
            })
        },
    })

    // ── AlmWorldMinterService ────────────────────────────────
    //
    // Indexes DealDukiMinted events from AlmWorldDukiMinter contracts. Two
    // ingest paths share the same persistence layer:
    //   • notifyMinterTx — the dApp's webhook hits this with a tx hash right
    //     after a successful mint. Cheap, single receipt fetch.
    //   • syncMinterEvents — eth_getLogs over a block range, used for backfill
    //     and as a safety net if a webhook is missed. Resumes from
    //     minter_sync_state.last_block_indexed when from_block is 0.

    router.service(AlmWorldMinterService, {
        async notifyMinterTx(req) {
            const events = await pullMinterEventsFromTx(req.chainEid, req.txHash)
            await processMinterEvents(_db, events)
            return create(NotifyMinterTxRespSchema, {
                events: events.map(toDealDukiMintedProto),
            })
        },

        async syncMinterEvents(req) {
            const cfg = getChainConfig(req.chainEid)
            const client = createPublicClient({ transport: http(cfg.rpcUrl) })

            const headBlock = req.toBlock > 0n ? req.toBlock : await client.getBlockNumber()

            // Resume from D1's last-indexed cursor if the caller didn't pin a
            // start block. +1 so we don't re-pull the previous tail block.
            const cursor = req.fromBlock > 0n
                ? req.fromBlock
                : (await getLastBlockIndexed(_db, req.chainEid)) + 1n
            let fromBlock = cursor < 1n ? 1n : cursor

            if (fromBlock > headBlock) {
                return create(SyncMinterEventsRespSchema, {
                    syncedUpToBlock: headBlock,
                    eventsIndexed: 0,
                })
            }

            const maxRange = req.maxBlockRange > 0n ? req.maxBlockRange : DEFAULT_MAX_BLOCK_RANGE
            let totalIndexed = 0
            let lastProcessedBlock = fromBlock - 1n

            for (let i = 0; i < MAX_CHUNKS_PER_REQUEST; i++) {
                if (fromBlock > headBlock) break
                const tentativeTo = fromBlock + maxRange - 1n
                const toBlock = tentativeTo < headBlock ? tentativeTo : headBlock

                const events = await pullDealDukiMintedByBlockRange(req.chainEid, fromBlock, toBlock)
                if (events.length > 0) {
                    await processMinterEvents(_db, events)
                    totalIndexed += events.length
                }
                lastProcessedBlock = toBlock
                fromBlock = toBlock + 1n
            }

            await setLastBlockIndexed(_db, req.chainEid, lastProcessedBlock)
            return create(SyncMinterEventsRespSchema, {
                syncedUpToBlock: lastProcessedBlock,
                eventsIndexed: totalIndexed,
            })
        },

        async getAgentDeals(req) {
            const page = await queryDeals(_db, {
                agentId: req.agentId.toString(),
                chainEid: req.chainEid,
                cursor: req.cursor,
                limit: req.limit,
            })
            return create(GetAgentDealsRespSchema, page)
        },

        async getRecentDeals(req) {
            const page = await queryDeals(_db, {
                agentId: null,
                chainEid: req.chainEid,
                cursor: req.cursor,
                limit: req.limit,
            })
            return create(GetRecentDealsRespSchema, page)
        },

        async getWalletDeals(req) {
            const page = await queryDeals(_db, {
                agentId: null,
                wallet: req.wallet,
                chainEid: req.chainEid,
                cursor: req.cursor,
                limit: req.limit,
            })
            return create(GetWalletDealsRespSchema, page)
        },
    })
}

// ── Minter helpers ──────────────────────────────────────────────────────

function toDealDukiMintedProto(evt: PulledDealDukiMintedEvent) {
    return create(DealDukiMintedEventSchema, {
        chainEid: evt.chainEid,
        sequence: evt.sequence.toString(),
        txHash: evt.txHash,
        blockNumber: evt.blockNumber,
        evtTime: evt.evtTime,
        yangReceiver: evt.yangReceiver,
        yinReceiver: evt.yinReceiver,
        stablecoin: evt.stablecoin,
        dukiAmount: evt.dukiAmount.toString(),
        almYangAmount: evt.almYangAmount.toString(),
        almYinAmount: evt.almYinAmount.toString(),
        minter: evt.minter,
        agentId: evt.agentId,
    })
}

type DealCursor = { blockNumber: number; sequence: string }

function encodeDealCursor(c: DealCursor): string {
    return btoa(JSON.stringify({ b: c.blockNumber, s: c.sequence }))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeDealCursor(raw: string | undefined | null): DealCursor | null {
    if (!raw) return null
    try {
        const padded = raw.replace(/-/g, '+').replace(/_/g, '/')
        const obj = JSON.parse(atob(padded))
        if (typeof obj?.b !== 'number' || typeof obj?.s !== 'string') return null
        return { blockNumber: obj.b, sequence: obj.s }
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

async function queryDeals(db: D1Database, args: QueryDealsArgs) {
    const limit = Math.min(100, Math.max(1, args.limit || 20))
    const cursor = decodeDealCursor(args.cursor)

    // Compound-key keyset pagination: rows strictly before (block_number, sequence)
    // come next. block_number breaks ties between agents on the same chain;
    // sequence as TEXT compares lexicographically — fine for the recent-window
    // case where all sequences are roughly the same width.
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
        where.push('(block_number < ? OR (block_number = ? AND sequence < ?))')
        params.push(cursor.blockNumber, cursor.blockNumber, cursor.sequence)
    }

    const sql = `
        SELECT chain_eid, sequence, tx_hash, block_number, evt_time,
               yang_receiver, yin_receiver, stablecoin,
               duki_amount, alm_yang_amount, alm_yin_amount,
               minter, agent_id
        FROM   deal_duki_minted_events
        ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY block_number DESC, sequence DESC
        LIMIT ?
    `
    const rows = (await db.prepare(sql).bind(...params, limit + 1).all<any>()).results ?? []

    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows
    const events = pageRows.map((r: any) =>
        create(DealDukiMintedEventSchema, {
            chainEid: r.chain_eid,
            sequence: String(r.sequence),
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
        ? encodeDealCursor({ blockNumber: Number(last.block_number), sequence: String(last.sequence) })
        : ''

    return { events, nextCursor, hasMore }
}

// ── Helpers ──────────────────────────────────────────────────

function rowToIdentity(row: any) {
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
function findBestCheckpoint(checkpoints: readonly bigint[], lastEvtSeq: number): bigint {
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
async function getContinuousDukerEvtSeq(chainEid: number): Promise<bigint> {
    return getContinuousEvtSeq('duker_registry_events', chainEid)
}

async function getContinuousDukigenEvtSeq(chainEid: number): Promise<bigint> {
    return getContinuousEvtSeq('dukigen_registry_events', chainEid)
}

async function getContinuousEvtSeq(table: string, chainEid: number): Promise<bigint> {
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

const DEFAULT_MAX_BLOCK_RANGE = 10000n
const MAX_CHUNKS_PER_REQUEST = 20

/**
 * Walk [fromBlock..latestBlock] in chunks of `maxBlockRange`, pulling logs and
 * applying any events whose evtSeq is past `lastEvtSeq`. Stops early once
 * caught up to `chainEvtSeq` or after MAX_CHUNKS_PER_REQUEST iterations — the
 * caller re-invokes to continue. Lets RPCs that cap getLogs at small ranges
 * (e.g. 50 blocks) still make progress under a single Worker request budget.
 */
async function chunkedSync<E>(args: ChunkedSyncArgs<E>): Promise<ChunkedSyncResult> {
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
