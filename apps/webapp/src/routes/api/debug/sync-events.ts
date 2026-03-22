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
import { getAllEvents } from '../../../services/blockchain-service'
import { applyEvents } from '../../../services/events-service'
import { toJson } from '@bufbuild/protobuf'
import { PbEventSchema } from '@repo/apidefs'

export const Route = createFileRoute('/api/debug/sync-events')({
    server: {
        handlers: {
            GET: async ({ request }) => {
                try {
                    const url = new URL(request.url)
                    const fromBlock = BigInt(url.searchParams.get('fromBlock') || '0')
                    const shouldApply = url.searchParams.get('apply') === 'true'

                    // Pull all DukerEvent logs from chain
                    const { events, latestBlock } = await getAllEvents(fromBlock)

                    // Optionally apply to DB
                    let applyResults = null
                    if (shouldApply && events.length > 0) {
                        applyResults = await applyEvents(events)
                    }

                    // Serialize PbEvent[] to JSON-safe objects
                    const eventsJson = events.map(evt => toJson(PbEventSchema, evt))

                    return Response.json({
                        success: true,
                        fromBlock: fromBlock.toString(),
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
