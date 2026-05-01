import { type ConnectRouter } from '@connectrpc/connect';
import { create } from '@bufbuild/protobuf';
import {
    DukigenRegistryService,
    GetAgentsRespSchema,
    ListAgentsRankedRespSchema,
} from '@repo/dukiregistry-apidefs';
import { _db, parseOpContractsRow, normalizeTimescale, encodeRankCursor, decodeRankCursor, rowToRankedAgent } from '../shared';


import {
    DukigenAgentSchema,
} from '@repo/dukiregistry-apidefs';

export function registerDukigenRegistryService(router: ConnectRouter) {
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


}
