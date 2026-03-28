/**
 * ConnectRPC service registration for the webapp's SSR router.
 * QueryService: read stubs (handled by TanStack loaders) + getUserInteractions
 * CmdService: X402Handle — delegates to x402-service.ts
 */

import { ConnectRouter, createClient, type HandlerContext } from '@connectrpc/connect'
import { QueryService, CmdService } from '@repo/apidefs'
import * as InteractionService from '../services/interaction-service'
import { create } from '@bufbuild/protobuf'
import { PbGetUserInteractionsRespSchema, PbUserInteractionSchema, PbDeltaEventsRespSchema } from '@repo/apidefs'
import type { NotifyTxReq, DukerTxReq } from '@repo/apidefs'
import { getGoApiTransport, MIGRATED } from '../lib/grpc-goapi-transport'
import { x402Handle } from './x402-service'
import { getEventsFromTx } from './blockchain-service'
import { applyEvents } from './events-service'

export function registerServices(router: ConnectRouter) {
    // ─── QueryService ────────────────────────────────────────────────
    router.service(QueryService, {
        async getPosts() { throw new Error('Use SSR loader') },
        async getPost() { throw new Error('Use SSR loader') },
        async getPostAgg() { throw new Error('Use SSR loader') },
        async getComments() { throw new Error('Use SSR loader') },
        async getRecentComments() { throw new Error('Use SSR loader') },
        async getUser() { throw new Error('Use SSR loader') },

        async getUserInteractions(req: any) {
            if (MIGRATED) {
                const client = createClient(QueryService, getGoApiTransport())
                return client.getUserInteractions(req)
            }
            const rows = await InteractionService.getAllInteractions(req.username)
            return create(PbGetUserInteractionsRespSchema, {
                interactions: rows.map(r => create(PbUserInteractionSchema, {
                    aggType: r.agg_type,
                    aggId: BigInt(r.agg_id ?? 0),
                    bitsFlag: r.bits_flag,
                })),
            })
        },

        async getCommentsByIds() { throw new Error('Use SSR loader') },
        async getCommentDelta() { throw new Error('Use SSR loader') },
    })

    // ─── CmdService — delegates to x402-service + notifyTx ───────────────
    router.service(CmdService, {
        async x402Handle(req: DukerTxReq, context: HandlerContext) {
            try {
                // Server-side address enforcement: use JWT-verified address
                const verifiedAddress = context?.requestHeader?.get?.('x-verified-address') || ''
                if (verifiedAddress) {
                    if (req.address && req.address.toLowerCase() !== verifiedAddress.toLowerCase()) {
                        throw new Error(`Address mismatch: req=${req.address} jwt=${verifiedAddress}`)
                    }
                    // Always use the JWT-verified address (override empty or matching)
                    req.address = verifiedAddress.toLowerCase()
                }
                return await x402Handle(req)
            } catch (err) {
                console.error('[x402Handle] Error:', err)
                throw err
            }
        },

        async notifyTx(req: NotifyTxReq) {
            const { txHash } = req
            if (!txHash) throw new Error('tx_hash is required')

            // 1. Pull + parse events from chain
            const events = await getEventsFromTx(txHash)
            if (events.length === 0) {
                return create(PbDeltaEventsRespSchema, { events: [] })
            }

            // 2. Apply events to DB
            await applyEvents(events)

            // 3. Return original on-chain events as-is
            return create(PbDeltaEventsRespSchema, { events })
        },
    })

}

/** @deprecated use registerServices */
export const registerDukerService = registerServices
