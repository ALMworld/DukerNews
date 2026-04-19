/**
 * ConnectRPC service registration for the webapp's SSR router.
 * QueryService: read stubs (handled by TanStack loaders) + getUserInteractions
 * TxService: TxHandle — delegates to payment-service.ts
 */

import { ConnectRouter, createClient, type HandlerContext } from '@connectrpc/connect'
import { QueryService, TxService } from '@repo/apidefs'
import * as InteractionService from '../services/interaction-service'
import { create } from '@bufbuild/protobuf'
import { PbGetUserInteractionsRespSchema, PbUserInteractionSchema, PbDeltaEventsRespSchema } from '@repo/apidefs'
import type { NotifyTxReq, DukerTxReq } from '@repo/apidefs'
import { getGoApiTransport, MIGRATED } from '../lib/grpc-goapi-transport'
import { handleTx } from './tx-service'
import { getEventsFromTx } from './blockchain-service'
import { applyEvents, getEventsByTxHash } from './events-service'

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

    // ─── TxService — delegates to payment-service + notifyTx ─────────────
    router.service(TxService, {
        async txHandle(req: DukerTxReq, context: HandlerContext) {
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
                return await handleTx(req)
            } catch (err) {
                console.error('[txHandle] Error:', err)
                throw err
            }
        },

        async notifyTx(req: NotifyTxReq) {
            const { txHash } = req
            console.log('[notifyTx] ▶ called with txHash:', txHash)
            if (!txHash) throw new Error('tx_hash is required')

            try {
                // 1. Check DB first — webhook may have already indexed this tx
                console.log('[notifyTx] Step 1: checking DB for existing events...')
                const dbEvents = await getEventsByTxHash(txHash)
                if (dbEvents.length > 0) {
                    console.log(`[notifyTx] ✓ Found ${dbEvents.length} events in DB, returning cached`)
                    return create(PbDeltaEventsRespSchema, { events: dbEvents })
                }
                console.log('[notifyTx] DB miss — no cached events')

                // 2. DB miss — pull + parse events from chain via RPC
                console.log('[notifyTx] Step 2: pulling events from chain via RPC...')
                const events = await getEventsFromTx(txHash)
                console.log(`[notifyTx] ✓ Got ${events.length} events from chain`)
                if (events.length === 0) {
                    return create(PbDeltaEventsRespSchema, { events: [] })
                }

                // 3. Apply events to DB
                console.log('[notifyTx] Step 3: applying events to DB...')
                await applyEvents(events)
                console.log('[notifyTx] ✓ Events applied successfully')

                // 4. Return on-chain events
                return create(PbDeltaEventsRespSchema, { events })
            } catch (err) {
                console.error('[notifyTx] ✗ Error:', err)
                throw err
            }
        },
    })

}

/** @deprecated use registerServices */
export const registerDukerService = registerServices
