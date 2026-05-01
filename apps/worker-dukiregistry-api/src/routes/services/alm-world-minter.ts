import { type ConnectRouter } from '@connectrpc/connect';
import { create } from '@bufbuild/protobuf';
import {
    AlmWorldMinterService, GetAgentDealsRespSchema,
    GetRecentDealsRespSchema,
    GetWalletDealsRespSchema
} from '@repo/dukiregistry-apidefs';
import { _db, queryDeals } from '../shared';



export function registerAlmWorldMinterService(router: ConnectRouter) {
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


}
