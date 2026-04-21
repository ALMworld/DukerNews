/**
 * grpc.ts — ConnectRPC handlers for DukerRegistryService + DukigenRegistryService.
 */

import type { ConnectRouter } from '@connectrpc/connect'
import { create } from '@bufbuild/protobuf'
import {
    DukerRegistryService,
    DukigenRegistryService,
    GetUsernameRespSchema,
    NotifyDukerTxRespSchema,
    NotifyDukigenTxRespSchema,
    GetAgentsRespSchema,
    DukerRegistryEventSchema,
    DukigenRegistryEventSchema,
    SyncEventsRespSchema,
} from '@repo/dukiregistry-apidefs'
import {
    DukerIdentitySchema,
    DukigenAgentSchema,
    AgentDealDukiBpsSchema,
} from '@repo/dukiregistry-apidefs'
import { pullTxReceipt, pullDukerEventsByBlockRange, pullDukigenEventsByBlockRange } from '../services/chain-puller'
import { processDukerEvents } from '../services/duker-event-service'
import { processDukigenEvents } from '../services/dukigen-event-service'
import { createPublicClient, http } from 'viem'
import { getChainConfig } from '../config'
import { dukerRegistryAbi, dukigenRegistryAbi } from 'contract-duki-alm-world'

// Store reference for context access — set from index.ts
let _db: D1Database

export function setDb(db: D1Database) {
    _db = db
}

/** Load per-agent preferences from D1 for a given identity. */
async function loadPreferences(chainEid: number, tokenId: string) {
    const rows = await _db.prepare(
        'SELECT agent_id, deal_duki_bps FROM duker_preferences WHERE chain_eid = ? AND token_id = ?'
    ).bind(chainEid, tokenId).all<any>()
    return (rows.results ?? []).map((r: any) =>
        create(AgentDealDukiBpsSchema, {
            agentId: r.agent_id,
            dealDukiBps: r.deal_duki_bps,
        })
    )
}

export function registerGrpcRoutes(router: ConnectRouter) {
    // ── DukerRegistryService ────────────────────────────────

    router.service(DukerRegistryService, {
        async getUsername(req) {
            const resp = create(GetUsernameRespSchema, {})

            let query = 'SELECT * FROM duker_users WHERE ego = ? COLLATE NOCASE AND status = ?'
            const params: any[] = [req.address, 'active']

            if (req.chainEid > 0) {
                query += ' AND chain_eid = ?'
                params.push(req.chainEid)
            }
            query += ' LIMIT 1'

            const row = await _db.prepare(query).bind(...params).first<any>()
            if (row) {
                const prefs = await loadPreferences(row.chain_eid, row.token_id)
                resp.identity = create(DukerIdentitySchema, {
                    username: row.username,
                    chainEid: row.chain_eid,
                    tokenId: row.token_id,
                    ego: row.ego,
                    dealDukiBpsList: prefs,
                    bio: row.bio ?? '',
                    website: row.website ?? '',
                })
            }
            return resp
        },

        async getIdentitiesByToken(req) {
            const resp = create(GetUsernameRespSchema, {})

            const row = await _db.prepare(
                'SELECT * FROM duker_users WHERE token_id = ? AND status = ? LIMIT 1'
            ).bind(req.tokenId, 'active').first<any>()

            if (row) {
                resp.identity = create(DukerIdentitySchema, {
                    username: row.username,
                    chainEid: row.chain_eid,
                    tokenId: row.token_id,
                    ego: row.ego,
                    bio: row.bio ?? '',
                    website: row.website ?? '',
                })
            }
            return resp
        },

        async notifyDukerTx(req) {
            const resp = create(NotifyDukerTxRespSchema, {})

            const pulled = await pullTxReceipt(req.chainEid, req.txHash)
            await processDukerEvents(_db, pulled.dukerEvents)

            // Return parsed events as proto messages
            resp.events = pulled.dukerEvents.map(evt =>
                create(DukerRegistryEventSchema, {
                    chainEid: evt.chainEid,
                    evtSeq: evt.evtSeq,
                    tokenId: evt.tokenId.toString(),
                    eventType: evt.eventType,
                    ego: evt.ego,
                    username: evt.username,
                    evtTime: evt.evtTime,
                    txHash: evt.txHash,
                    blockNumber: evt.blockNumber,
                })
            )
            return resp
        },

        async syncDukerEvents(req) {
            const DEFAULT_MAX_BLOCK_RANGE = 10000n
            const maxRange = req.maxBlockRange > 0n ? req.maxBlockRange : DEFAULT_MAX_BLOCK_RANGE
            const cfg = getChainConfig(req.chainEid)
            const client = createPublicClient({ transport: http(cfg.rpcUrl) })

            // Read on-chain state in one call: evtSeq + all 4 block checkpoints
            const [chainEvtSeq, checkpoints] = await client.readContract({
                address: cfg.dukerRegistryAddress,
                abi: dukerRegistryAbi,
                functionName: 'eventState',
            })

            if (Number(chainEvtSeq) === 0 || Number(chainEvtSeq) <= Number(req.lastEvtSeq)) {
                return create(SyncEventsRespSchema, {
                    syncedUpTo: chainEvtSeq as bigint,
                    eventsIndexed: 0,
                    chainEvtSeq: chainEvtSeq as bigint,
                })
            }

            // Find best fromBlock from checkpoints
            const fromBlock = findBestCheckpoint(checkpoints, Number(req.lastEvtSeq))
            const latestBlock = await client.getBlockNumber()
            const toBlock = fromBlock + maxRange < latestBlock ? fromBlock + maxRange : latestBlock

            // Pull and index events
            const events = await pullDukerEventsByBlockRange(req.chainEid, fromBlock, toBlock)
            // Filter to only events after lastEvtSeq
            const newEvents = events.filter(e => Number(e.evtSeq) > Number(req.lastEvtSeq))
            await processDukerEvents(_db, newEvents)

            const syncedUpTo = newEvents.length > 0
                ? BigInt(newEvents[newEvents.length - 1].evtSeq)
                : req.lastEvtSeq

            return create(SyncEventsRespSchema, {
                syncedUpTo,
                eventsIndexed: newEvents.length,
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
                owner: row.owner,
                originChainEid: row.origin_chain_eid,
                defaultDukiBps: row.default_duki_bps,
                minDukiBps: row.min_duki_bps,
                maxDukiBps: row.max_duki_bps,
                productType: row.product_type,
                dukiType: row.duki_type,
                pledgeUrl: row.pledge_url,
                tags: JSON.parse(row.tags || '[]'),
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
                        owner: row.owner,
                        originChainEid: row.origin_chain_eid,
                        defaultDukiBps: row.default_duki_bps,
                        minDukiBps: row.min_duki_bps,
                        maxDukiBps: row.max_duki_bps,
                    })
                ),
            })
        },

        async notifyDukigenTx(req) {
            const resp = create(NotifyDukigenTxRespSchema, {})

            const pulled = await pullTxReceipt(req.chainEid, req.txHash)
            await processDukigenEvents(_db, pulled.dukigenEvents)

            resp.events = pulled.dukigenEvents.map(evt =>
                create(DukigenRegistryEventSchema, {
                    chainEid: evt.chainEid,
                    evtSeq: evt.evtSeq,
                    agentId: evt.agentId,
                    eventType: evt.eventType,
                    ego: evt.ego,
                    evtTime: evt.evtTime,
                    txHash: evt.txHash,
                    blockNumber: evt.blockNumber,
                })
            )
            return resp
        },

        async syncDukigenEvents(req) {
            const DEFAULT_MAX_BLOCK_RANGE = 10000n
            const maxRange = req.maxBlockRange > 0n ? req.maxBlockRange : DEFAULT_MAX_BLOCK_RANGE
            const cfg = getChainConfig(req.chainEid)
            const client = createPublicClient({ transport: http(cfg.rpcUrl) })

            // Read on-chain state in one call: evtSeq + all 4 block checkpoints
            const [chainEvtSeq, checkpoints] = await client.readContract({
                address: cfg.dukigenRegistryAddress,
                abi: dukigenRegistryAbi,
                functionName: 'eventState',
            })

            if (Number(chainEvtSeq) === 0 || Number(chainEvtSeq) <= Number(req.lastEvtSeq)) {
                return create(SyncEventsRespSchema, {
                    syncedUpTo: chainEvtSeq as bigint,
                    eventsIndexed: 0,
                    chainEvtSeq: chainEvtSeq as bigint,
                })
            }

            // Find best fromBlock from checkpoints
            const fromBlock = findBestCheckpoint(checkpoints, Number(req.lastEvtSeq))
            const latestBlock = await client.getBlockNumber()
            const toBlock = fromBlock + maxRange < latestBlock ? fromBlock + maxRange : latestBlock

            // Pull and index events
            const events = await pullDukigenEventsByBlockRange(req.chainEid, fromBlock, toBlock)
            const newEvents = events.filter(e => Number(e.evtSeq) > Number(req.lastEvtSeq))
            await processDukigenEvents(_db, newEvents)

            const syncedUpTo = newEvents.length > 0
                ? BigInt(newEvents[newEvents.length - 1].evtSeq)
                : req.lastEvtSeq

            return create(SyncEventsRespSchema, {
                syncedUpTo,
                eventsIndexed: newEvents.length,
                chainEvtSeq: chainEvtSeq as bigint,
            })
        },
    })
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Find the best (lowest) block number from checkpoints that covers
 * events after lastEvtSeq. Falls back to the earliest non-zero checkpoint.
 */
function findBestCheckpoint(checkpoints: bigint[], lastEvtSeq: number): bigint {
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
