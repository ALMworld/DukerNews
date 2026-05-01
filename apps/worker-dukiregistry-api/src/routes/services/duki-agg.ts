import { ConnectError, Code, type ConnectRouter } from '@connectrpc/connect';
import { create } from '@bufbuild/protobuf';
import {
    DukiAggService,
    PbQuickOverviewRespSchema,
} from '@repo/dukiregistry-apidefs';
import {
    _db,
    queryMarketQuickTotals,
    queryChainMinterOverviews,
    queryDeals,
    readKvConfigJson,
    rowToAgent,
} from '../shared';

const FEATURED_KEY = 'featured_agents'
const TRENDING_KEY = 'trending_agents'

export function registerDukiAggService(router: ConnectRouter) {
    router.service(DukiAggService, {
        async getQuickOverview() {
            try {
                const activityLimit = 20

                const cfg = await readKvConfigJson(_db, [FEATURED_KEY, TRENDING_KEY])
                const featuredIds = parseAgentIdList(cfg.get(FEATURED_KEY))
                const trendingIds = parseAgentIdList(cfg.get(TRENDING_KEY))
                const unionIds = [...new Set([...featuredIds, ...trendingIds])]

                const agentRowsById = unionIds.length > 0
                    ? await fetchAgentRowsByIds(_db, unionIds)
                    : new Map<string, any>()

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
                    featuredAgents: pickAgents(featuredIds, agentRowsById),
                    trendingAgents: pickAgents(trendingIds, agentRowsById),
                    recentDukiEvents: activity.events,
                })
            } catch (err: any) {
                console.error("GetQuickOverview ERROR:", err)
                throw new ConnectError(err.message || String(err), Code.Internal)
            }
        },
    })
}

function parseAgentIdList(raw: unknown): string[] {
    if (!Array.isArray(raw)) return []
    return raw.map((v) => String(v)).filter((s) => s.length > 0)
}

async function fetchAgentRowsByIds(db: D1Database, agentIds: string[]) {
    const placeholders = agentIds.map(() => '?').join(',')
    const rows = (await db
        .prepare(`SELECT * FROM dukigen_agents WHERE agent_id IN (${placeholders})`)
        .bind(...agentIds)
        .all<any>()).results ?? []
    return new Map<string, any>(rows.map((r) => [String(r.agent_id), r]))
}

function pickAgents(ids: string[], byId: Map<string, any>) {
    const out = []
    for (const id of ids) {
        const row = byId.get(id)
        if (row) out.push(rowToAgent(row))
    }
    return out
}
