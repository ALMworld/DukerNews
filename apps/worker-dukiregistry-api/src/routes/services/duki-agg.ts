import { ConnectError, Code, type ConnectRouter } from '@connectrpc/connect';
import { create } from '@bufbuild/protobuf';
import {
    DukiAggService,
    PbQuickOverviewRespSchema,
} from '@repo/dukiregistry-apidefs';
import { _db, queryRankedAgentRows, queryMarketQuickTotals, queryChainMinterOverviews, rowToAgent, queryDeals } from '../shared';



export function registerDukiAggService(router: ConnectRouter) {
    // ── DukiAggService ───────────────────────────────────────

    router.service(DukiAggService, {
        async getQuickOverview() {
            try {
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
                    featuredAgents: rankedRows.slice(0, featuredLimit).map(rowToAgent),
                    trendingAgents: rankedRows.slice(0, trendingLimit).map(rowToAgent),
                    recentDukiEvents: activity.events,
                })
            } catch (err: any) {
                console.error("GetQuickOverview ERROR:", err)
                throw new ConnectError(err.message || String(err), Code.Internal)
            }
        },
    })


}
