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
import { authMiddleware } from '../../middleware'

export const Route = createFileRoute('/api/notify-tx')({
    server: {
        // Note: auth is enforced inline to allow X-E2E-Secret dev bypass for e2e tests.
        // requireLoginMiddleware is NOT used here so the bypass header can be checked first.
        middleware: [authMiddleware],
        handlers: {
            POST: async ({ request, context }) => {
                try {
                    // Dev-only: e2e tests bypass auth with a special header
                    const isE2E = process.env.NODE_ENV !== 'production'
                        && request.headers.get('X-E2E-Secret') === 'duker-e2e-dev'

                    // Enforce auth for non-e2e requests
                    if (!isE2E && !context.auth) {
                        return Response.json({ success: false, message: 'Not logged in' }, { status: 401 })
                    }

                    const payload = isE2E
                        ? { address: request.headers.get('X-E2E-Address') ?? '', username: '', ego: 'human', chainId: '', dukiBps: 0, expireAt: 0 } as any
                        : context.auth!

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
