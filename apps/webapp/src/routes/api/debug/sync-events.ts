/**
 * GET /api/debug/sync-events — Pull all DukerEvent logs from the chain.
 *
 * Debug-only endpoint. Fetches all on-chain events, converts to PbEvent[],
 * optionally applies them to the DB, and returns JSON.
 *
 * Query params:
 *   ?fromBlock=N   — start from block N (default: 0)
 *   ?apply=true    — also apply events to DB via events-service
 */
import { createFileRoute } from '@tanstack/react-router'
import { getEventsInRange, getEventsFromTx } from '../../../services/blockchain-service'
import { applyEvents } from '../../../services/events-service'
import { toJson } from '@bufbuild/protobuf'
import { PbEventSchema } from '@repo/apidefs'

export const Route = createFileRoute('/api/debug/sync-events')({
    server: {
        handlers: {
            GET: async ({ request }) => {
                try {
                    const url = new URL(request.url)
                    const txHash = url.searchParams.get('txHash')
                    const shouldApply = url.searchParams.get('apply') === 'true'

                    let events: any[]
                    let latestBlock = 0n

                    if (txHash) {
                        // Fast path: process a single known transaction
                        events = await getEventsFromTx(txHash)
                    } else {
                        const fromBlock = BigInt(url.searchParams.get('fromBlock') || '0')
                        const toBlock = BigInt(url.searchParams.get('toBlock') || String(fromBlock + 98n))
                        const result = await getEventsInRange(fromBlock, toBlock)
                        events = result.events
                    }

                    // Optionally apply to DB
                    let applyResults = null
                    if (shouldApply && events.length > 0) {
                        applyResults = await applyEvents(events)
                    }

                    // Serialize PbEvent[] to JSON-safe objects
                    const eventsJson = events.map(evt => toJson(PbEventSchema, evt))

                    return Response.json({
                        success: true,
                        fromBlock: txHash ?? latestBlock.toString(),
                        latestBlock: latestBlock.toString(),
                        eventCount: events.length,
                        events: eventsJson,
                        ...(applyResults ? { applyResults } : {}),
                    })
                } catch (e: any) {
                    console.error('[debug/sync-events] Error:', e)
                    return Response.json(
                        { success: false, error: e?.message || 'Unknown error' },
                        { status: 500 }
                    )
                }
            },
        },
    },
})
