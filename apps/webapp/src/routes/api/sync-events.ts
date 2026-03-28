/**
 * /api/sync-events — Sync DukerEvent logs from chain to DB.
 *
 * POST only. Two modes:
 *   1. Block range: { startBlockNumber, endBlockNumber? } → 1 RPC call (eth_getLogs)
 *   2. Tx hashes:   { txHashes: string[] }               → 1 RPC per tx (max 8)
 *
 * Auth: X-Admin-Secret header.
 */
import { createFileRoute } from '@tanstack/react-router'
import { getEventsFromTx, getEventsInRange } from '../../services/blockchain-service'
import { applyEvents } from '../../services/events-service'
import { env } from 'cloudflare:workers'

function isAdminAuthorized(request: Request): boolean {
    if (process.env.NODE_ENV !== 'production') return true  // dev: allow all
    const expected = (env as any).OP_ADMIN_SECRET
    if (!expected) return false
    return request.headers.get('X-Admin-Secret') === expected
}

export const Route = createFileRoute('/api/sync-events')({
    server: {
        handlers: {
            POST: async ({ request }) => {
                try {
                    if (!isAdminAuthorized(request)) {
                        return Response.json({ success: false, message: 'Unauthorized' }, { status: 401 })
                    }

                    const body = await request.json() as {
                        startBlockNumber?: number | string
                        endBlockNumber?: number | string
                        txHashes?: string[]
                    }

                    const { txHashes, startBlockNumber, endBlockNumber } = body

                    // ── Mode 1: Sync specific transactions (max 8) ──────
                    if (txHashes && txHashes.length > 0) {
                        if (txHashes.length > 8) {
                            return Response.json({ success: false, message: 'Max 8 txHashes per call' }, { status: 400 })
                        }

                        const allResults: any[] = []
                        const errors: any[] = []

                        for (const txHash of txHashes) {
                            try {
                                const events = await getEventsFromTx(txHash)
                                if (events.length > 0) {
                                    const results = await applyEvents(events)
                                    allResults.push({
                                        txHash,
                                        synced: results.length,
                                        events: results.map(r => ({
                                            evtSeq: r.evtSeq,
                                            eventType: r.eventType,
                                            username: r.username,
                                        })),
                                    })
                                } else {
                                    allResults.push({ txHash, synced: 0, message: 'No DukerEvent found' })
                                }
                            } catch (err: any) {
                                errors.push({ txHash, error: err?.message || 'Failed' })
                            }
                        }

                        return Response.json({
                            success: true,
                            mode: 'txHashes',
                            results: allResults,
                            errors: errors.length > 0 ? errors : undefined,
                        })
                    }

                    // ── Mode 2: Sync a block range (1 RPC call) ─────────
                    if (startBlockNumber != null) {
                        const from = BigInt(startBlockNumber)
                        const to = endBlockNumber != null ? BigInt(endBlockNumber) : from + 98n

                        const { events, scannedToBlock } = await getEventsInRange(from, to)

                        let applied = 0
                        if (events.length > 0) {
                            const results = await applyEvents(events)
                            applied = results.length
                        }

                        return Response.json({
                            success: true,
                            mode: 'blockRange',
                            synced: applied,
                            totalOnChain: events.length,
                            fromBlock: from.toString(),
                            toBlock: scannedToBlock.toString(),
                        })
                    }

                    return Response.json(
                        { success: false, message: 'Provide txHashes or startBlockNumber' },
                        { status: 400 }
                    )

                } catch (e: any) {
                    console.error('[sync-events] Error:', e)
                    return Response.json(
                        { success: false, message: e?.message || 'Sync failed' },
                        { status: 500 }
                    )
                }
            },
        },
    },
})
