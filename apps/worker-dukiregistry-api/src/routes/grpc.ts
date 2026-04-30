/**
 * grpc.ts — ConnectRPC handlers for DukerRegistryService, DukigenRegistryService,
 * AlmWorldMinterService, and BlockchainSyncService.
 *
 * All notify/sync (chain-ingest) logic is consolidated in BlockchainSyncService.
 * The per-contract services expose query-only RPCs.
 */

import type { ConnectRouter } from '@connectrpc/connect'
import { create } from '@bufbuild/protobuf'
import {
    DukerRegistryService,
    DukigenRegistryService,
    AlmWorldMinterService,
    BlockchainSyncService,
    DukiAggService,
    ContractType,
    GetUsernameRespSchema,
    CheckUsernameRespSchema,
    NotifyTxRespSchema,
    BlockchainSyncRespSchema,
    GetAgentDealsRespSchema,
    GetRecentDealsRespSchema,
    GetWalletDealsRespSchema,
    DealDukiMintedEventSchema,
    GetAgentsRespSchema,
    ListAgentsRankedRespSchema,
    RankedAgentSchema,
    PbQuickOverviewRespSchema,
    AlmWorldDukiMinterOverviewSchema,
    DukigenAgentAggSchema,
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
    getLastBlockNumber,
    setLastBlockNumber,
    type PulledDealDukiMintedEvent,
} from '../services/minter-event-service'
import { createPublicClient, http } from 'viem'
import { getChainConfig, getSupportedChainEids } from '../config'
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

async function queryRankedAgentRows(db: D1Database, timescale: string, limit: number) {
    const rows = (await db.prepare(
        `SELECT a.*,
                COALESCE(m.credibility, 0) AS metric_credibility,
                COALESCE(m.updated_at, 0) AS metric_updated_at,
                COALESCE(dm.mint_credibility_d6, 0) AS mint_credibility_d6
         FROM   dukigen_agents a
         LEFT JOIN dukigen_agent_metrics m
                ON m.agent_id = a.agent_id AND m.timescale = ?
         LEFT JOIN (
             SELECT agent_id,
                    COALESCE(SUM(CAST(duki_amount AS REAL)), 0) / 1000000000000.0 AS mint_credibility_d6
             FROM deal_duki_minted_events
             GROUP BY agent_id
         ) dm ON dm.agent_id = a.agent_id
         ORDER BY COALESCE(m.credibility, 0) DESC, a.agent_id DESC
         LIMIT ?`
    ).bind(timescale, limit).all<any>()).results ?? []

    return rows
}

async function queryMarketQuickTotals(db: D1Database) {
    const [totalAgentsRow, totals, activeChainsRow] = await Promise.all([
        db.prepare('SELECT COUNT(*) AS total_agents FROM dukigen_agents').first<{ total_agents?: number }>(),
        db.prepare(
        `SELECT COUNT(*) AS transaction_count,
                COALESCE(SUM(CAST(duki_amount AS REAL)), 0) / 1000000000000.0 AS total_d6_amount
         FROM deal_duki_minted_events`
        ).first<{ transaction_count?: number; total_d6_amount?: number }>(),
        db.prepare(
        `SELECT COUNT(*) AS active_chains
         FROM (
           SELECT DISTINCT chain_eid FROM dukigen_agents
           UNION
           SELECT DISTINCT chain_eid FROM deal_duki_minted_events
         )`
        ).first<{ active_chains?: number }>(),
    ])

    return {
        totalAgents: Number(totalAgentsRow?.total_agents ?? 0),
        totalD6Amount: BigInt(Math.floor(Number(totals?.total_d6_amount ?? 0))),
        activeChainCount: Number(activeChainsRow?.active_chains ?? 0),
        transactionsCount: BigInt(Number(totals?.transaction_count ?? 0)),
    }
}

async function queryChainMinterOverviews(db: D1Database) {
    const rows = (await db.prepare(
        `SELECT chain_eid,
                COALESCE(MAX(CAST(evt_seq AS INTEGER)), 0) AS evt_seq,
                COALESCE(SUM(CAST(duki_amount AS REAL)), 0) / 1000000000000.0 AS total_d6_amount
         FROM deal_duki_minted_events
         GROUP BY chain_eid`
    ).all<any>()).results ?? []

    const byChain = new Map(rows.map((row: any) => [Number(row.chain_eid), row]))
    const zeroAddress = '0x0000000000000000000000000000000000000000'

    return getSupportedChainEids()
        .map((chainEid) => {
            const cfg = getChainConfig(chainEid)
            if (!cfg.almWorldDukiMinterAddress || cfg.almWorldDukiMinterAddress === zeroAddress) return null
            const row = byChain.get(chainEid)
            return create(AlmWorldDukiMinterOverviewSchema, {
                chainEid,
                contractAddr: cfg.almWorldDukiMinterAddress,
                evtSeq: BigInt(Number(row?.evt_seq ?? 0)),
                totalD6Amount: BigInt(Math.floor(Number(row?.total_d6_amount ?? 0))),
            })
        })
        .filter((item): item is NonNullable<typeof item> => item != null)
}

function rowToAgent(row: any) {
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
        credibilityWallet: row.credibility_wallet ?? '',
    })
}

function rowToRankedAgent(row: any) {
    return create(RankedAgentSchema, {
        agent: rowToAgent(row),
        credibility: BigInt(row.metric_credibility ?? 0),
    })
}

function rowToAgentAgg(row: any) {
    const now = BigInt(Math.floor(Date.now() / 1000))
    return create(DukigenAgentAggSchema, {
        agent: rowToAgent(row),
        credibility: BigInt(row.metric_credibility ?? 0),
        credibilitySnapshotTime: BigInt(row.metric_updated_at ?? 0) || now,
        mintCredibility: BigInt(Math.floor(Number(row.mint_credibility_d6 ?? 0))),
        mintCredibilitySnapshotTime: now,
    })
}


export function registerGrpcRoutes(router: ConnectRouter) {
    // ── DukiAggService ───────────────────────────────────────

    router.service(DukiAggService, {
        async getQuickOverview() {
            const featuredLimit = 3
            const trendingLimit = 5
            const activityLimit = 20

            const rankedRows = await queryRankedAgentRows(_db, 'all', Math.max(featuredLimit, trendingLimit))
            const activity = await queryDeals(_db, {
                agentId: null,
                chainEid: 0,
                cursor: '',
                limit: activityLimit,
            })
            const totals = await queryMarketQuickTotals(_db)
            const minterOverview = await queryChainMinterOverviews(_db)

            return create(PbQuickOverviewRespSchema, {
                totalAgents: totals.totalAgents,
                totalD6Amount: totals.totalD6Amount,
                activeChainCount: totals.activeChainCount,
                transactionsCount: totals.transactionsCount,
                minterOverview,
                featuredAgents: rankedRows.slice(0, featuredLimit).map(rowToAgentAgg),
                trendingAgents: rankedRows.slice(0, trendingLimit).map(rowToAgentAgg),
                recentDukiEvents: activity.events,
            })
        },
    })

    // ── DukerRegistryService ────────────────────────────────

    router.service(DukerRegistryService, {
        async getUsername(req) {
            let query = 'SELECT * FROM duker_users WHERE ego = ? COLLATE NOCASE AND active = ?'
            const params: any[] = [req.address, 1]

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
                'SELECT * FROM duker_users WHERE username = ? COLLATE NOCASE AND active = ? LIMIT 1'
            ).bind(req.username, 1).first<any>()

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
                'SELECT * FROM duker_users WHERE token_id = ? AND active = ? ORDER BY chain_eid ASC'
            ).bind(req.tokenId, 1).all<any>()

            return create(GetUsernameRespSchema, {
                identities: (result.results ?? []).map(rowToIdentity),
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
                originChainEid: row.chain_eid,
                approxBps: row.approx_bps ?? 0,
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
                        originChainEid: row.chain_eid,
                        approxBps: row.approx_bps ?? 0,
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

            const items = pageRows.map(rowToRankedAgent)

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

    })

    // ── AlmWorldMinterService (query-only) ────────────────────

    router.service(AlmWorldMinterService, {
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

    // ── BlockchainSyncService (unified ingest) ──────────────────
    //
    // Consolidates all notify/sync RPCs for DukerRegistry, DukigenRegistry,
    // and AlmWorldMinter into a single service with a ContractType switch.

    router.service(BlockchainSyncService, {
        async notifyTx(req) {
            const resp = create(NotifyTxRespSchema, {})

            switch (req.contract) {
                case ContractType.DUKER_REGISTRY: {
                    const pulled = await pullTxReceipt(req.chainEid, req.txHash)
                    await processDukerEvents(_db, pulled.dukerEvents)
                    resp.dukerEvents = pulled.dukerEvents
                    break
                }
                case ContractType.DUKIGEN_REGISTRY: {
                    const pulled = await pullTxReceipt(req.chainEid, req.txHash)
                    await processDukigenEvents(_db, pulled.dukigenEvents)
                    resp.dukigenEvents = pulled.dukigenEvents
                    break
                }
                case ContractType.ALM_WORLD_MINTER: {
                    const events = await pullMinterEventsFromTx(req.chainEid, req.txHash)
                    await processMinterEvents(_db, events)
                    resp.minterEvents = events.map(toDealDukiMintedProto)
                    break
                }
                default:
                    throw new Error(`Unknown contract type: ${req.contract}`)
            }

            return resp
        },

        async syncEvents(req) {
            switch (req.contract) {
                case ContractType.DUKER_REGISTRY:
                    return await syncDukerContract(req.chainEid)

                case ContractType.DUKIGEN_REGISTRY:
                    return await syncDukigenContract(req.chainEid)

                case ContractType.ALM_WORLD_MINTER:
                    return await syncMinterContract(req.chainEid)

                default:
                    throw new Error(`Unknown contract type: ${req.contract}`)
            }
        },
    })
}

// ── Sync implementations (one per contract) ─────────────────────────────

async function syncDukerContract(chainEid: number) {
    const lastEvtSeq = await getContinuousDukerEvtSeq(chainEid)
    const cfg = getChainConfig(chainEid)
    const client = createPublicClient({ transport: http(cfg.rpcUrl) })

    const [chainEvtSeq, checkpoints] = await client.readContract({
        address: cfg.dukerRegistryAddress,
        abi: dukerRegistryAbi,
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
        pull: (from, to) => pullDukerEventsByBlockRange(chainEid, from, to),
        process: (evts) => processDukerEvents(_db, evts),
        getEvtSeq: (e) => e.evtSeq,
    })

    return create(BlockchainSyncRespSchema, {
        lastEvtSeq: result.syncedUpTo,
        eventsIndexed: result.eventsIndexed,
        lastBlockNumber: latestBlock,
    })
}

async function syncDukigenContract(chainEid: number) {
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

async function syncMinterContract(chainEid: number) {
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
            lastEvtSeqProcessed = events[events.length - 1].evt_seq
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

function toDealDukiMintedProto(evt: PulledDealDukiMintedEvent) {
    return create(DealDukiMintedEventSchema, {
        chainEid: evt.chainEid,
        sequence: evt.evt_seq.toString(),
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

    // Compound-key keyset pagination: rows strictly before (block_number, evt_seq)
    // come next. block_number breaks ties between agents on the same chain;
    // evt_seq as TEXT compares lexicographically — fine for the recent-window
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
        where.push('(block_number < ? OR (block_number = ? AND evt_seq < ?))')
        params.push(cursor.blockNumber, cursor.blockNumber, cursor.sequence)
    }

    const sql = `
        SELECT chain_eid, evt_seq, tx_hash, block_number, evt_time,
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
            chainEid: r.chain_eid,
            sequence: String(r.evt_seq),
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
        ? encodeDealCursor({ blockNumber: Number(last.block_number), sequence: String(last.evt_seq) })
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
