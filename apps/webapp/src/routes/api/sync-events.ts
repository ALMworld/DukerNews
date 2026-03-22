/**
 * GET /api/sync-events — Pull DukerEvent logs from chain and apply to DB.
 *
 * Incremental: reads MAX(block_number) from events table, pulls only new blocks.
 * Rate-limited via Cache-Control: max-age=8 (Cloudflare edge cache).
 */
import { createFileRoute } from '@tanstack/react-router'
import { getAllEvents } from '../../services/blockchain-service'
import { applyEvents } from '../../services/events-service'
import { getKysely } from '../../lib/db'
import { sql } from 'kysely'

export const Route = createFileRoute('/api/sync-events')({
    server: {
        handlers: {
            GET: async () => {
                try {
                    const db = getKysely()

                    // Read max block_number already indexed
                    let fromBlock = 0n
                    if (db) {
                        const row = await sql<{ block_number: number | null }>`
                            SELECT block_number FROM events ORDER BY evt_seq DESC LIMIT 1
                        `.execute(db).then(r => r.rows[0])
                        if (row?.block_number != null && row.block_number > 0) {
                            fromBlock = BigInt(row.block_number) + 1n
                        }
                    }

                    // Pull events from chain starting from fromBlock
                    const { events, latestBlock } = await getAllEvents(fromBlock)

                    let applied = 0
                    if (events.length > 0) {
                        const results = await applyEvents(events)
                        applied = results.length
                    }

                    const body = {
                        success: true,
                        synced: applied,
                        totalOnChain: events.length,
                        fromBlock: fromBlock.toString(),
                        latestBlock: latestBlock.toString(),
                    }

                    return new Response(JSON.stringify(body), {
                        status: 200,
                        headers: {
                            'Content-Type': 'application/json',
                            'Cache-Control': 'public, max-age=8',
                        },
                    })
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
