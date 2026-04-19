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
} from '@repo/dukiregistry-apidefs'
import {
    DukerIdentitySchema,
    DukigenAgentSchema,
    AgentPreferenceSchema,
} from '@repo/dukiregistry-apidefs'
import { pullTxReceipt } from '../services/chain-puller'
import { processDukerEvents } from '../services/duker-event-service'
import { processDukigenEvents } from '../services/dukigen-event-service'

// Store reference for context access — set from index.ts
let _db: D1Database

export function setDb(db: D1Database) {
    _db = db
}

/** Load per-agent preferences from D1 for a given identity. */
async function loadPreferences(chainEid: number, tokenId: string) {
    const rows = await _db.prepare(
        'SELECT agent_id, prefer_bps FROM duker_preferences WHERE chain_eid = ? AND token_id = ?'
    ).bind(chainEid, tokenId).all<any>()
    return (rows.results ?? []).map((r: any) =>
        create(AgentPreferenceSchema, {
            agentId: BigInt(r.agent_id),
            preferBps: r.prefer_bps,
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
                    preferences: prefs,
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
    })
}
