/**
 * GET /api/sync-events — Pull DukerEvent logs from chain and apply to DB.
 *
 * Cursor: uses block_number of the highest evt_seq row.
 * Re-scans that block (inclusive) — safe because applyEvents deduplicates
 * on evt_seq via onConflict(doNothing), making each call idempotent.
 * This avoids the fromBlock > latestBlock edge case where +1 would send
 * a future block to the RPC and get an "invalid param" error.
 */
import { createFileRoute } from '@tanstack/react-router'
import { getAllEvents } from '../../services/blockchain-service'
import { applyEvents } from '../../services/events-service'
import { getKysely } from '../../lib/db'
import { getHomeChain } from '../../lib/server-chain'
import { sql } from 'kysely'

export const Route = createFileRoute('/api/sync-events')({
    server: {
        handlers: {
            GET: async () => {
                try {
                    const db = getKysely()
                    const { deployBlock } = getHomeChain()

                    // Read max block_number already indexed
                    // Default to deployBlock when DB is empty (avoids querying from genesis)
                    let fromBlock = deployBlock ?? 0n
                    if (db) {
                        const row = await sql<{ block_number: number | null }>`
                            SELECT block_number FROM events ORDER BY evt_seq DESC LIMIT 1
                        `.execute(db).then(r => r.rows[0])
                        if (row?.block_number != null && row.block_number > 0) {
                            fromBlock = BigInt(row.block_number)  // inclusive re-scan, deduped by evt_seq
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
