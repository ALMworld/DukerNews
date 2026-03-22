/**
 * POST /api/notify-tx — Parse DukerEvent logs from a tx receipt and apply them.
 *
 * Orchestrates:
 *   1. blockchain-service: getEventsFromTx(txHash) → PbEvent[]
 *   2. events-service:     applyEvents(events)     → domain mutations + persist
 *   3. Re-issue JWT if USER_MINTED found
 */
import { createFileRoute } from '@tanstack/react-router'
import { EventType } from '@repo/apidefs'
import { getEventsFromTx } from '../../services/blockchain-service'
import { applyEvents } from '../../services/events-service'
import {
    signJwt,
    buildCookieHeader,
    getJwtExpirySecs,
    type JWTPayload,
} from '../../server/auth-utils'
import { requireLoginMiddleware } from '../../middleware'

export const Route = createFileRoute('/api/notify-tx')({
    server: {
        middleware: [requireLoginMiddleware],
        handlers: {
            POST: async ({ request, context }) => {
                try {
                    const payload = context.auth!

                    // Parse request body
                    const body = await request.json() as { txHash: string; dukiBps?: number }
                    const { txHash, dukiBps } = body
                    if (!txHash) {
                        return Response.json({ success: false, message: 'txHash is required' }, { status: 400 })
                    }

                    // 1. Pull + parse events from chain
                    const events = await getEventsFromTx(txHash)
                    if (events.length === 0) {
                        return Response.json({ success: false, message: 'No DukerEvent found in transaction' })
                    }

                    // 2. Apply events to DB
                    const results = await applyEvents(events)

                    // 3. Re-issue JWT if USER_MINTED found
                    const mintResult = results.find(r => r.eventType === EventType.USER_MINTED && r.username)
                    if (mintResult) {
                        const newPayload: JWTPayload = {
                            ...payload,
                            username: mintResult.username!,
                            dukiBps: dukiBps ?? 0,
                            expireAt: Math.floor(Date.now() / 1000) + getJwtExpirySecs(),
                        }
                        const newToken = await signJwt(newPayload)

                        return new Response(
                            JSON.stringify({
                                success: true,
                                data: newPayload,
                                events: results.map(r => ({
                                    eventType: r.eventType,
                                    evtSeq: r.evtSeq,
                                    username: r.username,
                                })),
                            }),
                            {
                                status: 200,
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Set-Cookie': buildCookieHeader(newToken),
                                },
                            }
                        )
                    }

                    // No username event — return results
                    return Response.json({
                        success: true,
                        message: 'Events processed (no JWT update needed)',
                        events: results.map(r => ({
                            eventType: r.eventType,
                            evtSeq: r.evtSeq,
                            username: r.username,
                        })),
                    })

                } catch (e: any) {
                    console.error('[notify-tx] Error:', e)
                    return Response.json(
                        { success: false, message: e?.shortMessage || e?.message || 'Failed to process tx' },
                        { status: 500 }
                    )
                }
            },
        },
    },
})
