/**
 * POST /api/notify-txs — QuickNode Stream webhook endpoint.
 *
 * Receives batch transaction receipts pushed by QuickNode,
 * filters DukerEvent logs, and applies them via events-service.
 *
 * Auth: QuickNode security token (x-qn-api-token header).
 * No RPC calls — all data comes in the webhook payload.
 */
import { createFileRoute } from '@tanstack/react-router'
import { parseEventLogs, type Log } from 'viem'
import { dukerNewsAbi } from '../../lib/contracts'
import { getEventsFromWebhookLogs } from '../../services/blockchain-service'
import { applyEvents } from '../../services/events-service'
import { env } from 'cloudflare:workers'

/** QuickNode webhook receipt shape */
interface WebhookReceipt {
    transactionHash: string
    status: string
    logs: WebhookLog[]
}

interface WebhookLog {
    topics: string[]
    data: string
    blockNumber: string
    logIndex: string
    transactionIndex: string
    transactionHash?: string
}

const DUKER_EVENT_TOPIC = '0x9317a3b895c15cad4724d40d39a62086e5d3b8dd56b1ab4482767a8d57ad3d6b'

export const Route = createFileRoute('/api/notify-txs')({
    server: {
        handlers: {
            POST: async ({ request }) => {
                const startTime = Date.now()

                try {
                    // Verify QuickNode security token
                    const signingKey = (env as any).WEBHOOK_SECRET_NOTIFY_TXS
                    if (signingKey) {
                        const headerToken = request.headers.get('x-qn-api-token')
                        if (headerToken !== signingKey) {
                            console.error('[notify-txs] Invalid security token')
                            return Response.json({ success: false, message: 'Unauthorized' }, { status: 401 })
                        }
                    }

                    const body = await request.json() as { matchingReceipts?: WebhookReceipt[] }
                    const receipts = body.matchingReceipts
                    if (!Array.isArray(receipts) || receipts.length === 0) {
                        return Response.json({ success: true, message: 'No matching receipts', eventsProcessed: 0 })
                    }

                    // Collect DukerEvent logs from all receipts
                    const allDukerLogs: Log[] = []
                    const txHashes: string[] = []

                    for (const receipt of receipts) {
                        if (!receipt.logs || receipt.status !== '0x1') continue

                        const dukerLogs = receipt.logs.filter(
                            (log) => log.topics?.[0]?.toLowerCase() === DUKER_EVENT_TOPIC.toLowerCase()
                        )

                        for (const log of dukerLogs) {
                            allDukerLogs.push({
                                ...log,
                                address: log.data.slice(0, 42) as `0x${string}`, // not critical, overridden by parseEventLogs
                                topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
                                data: log.data as `0x${string}`,
                                blockNumber: BigInt(log.blockNumber),
                                logIndex: Number(log.logIndex),
                                transactionIndex: Number(log.transactionIndex),
                                transactionHash: (log.transactionHash ?? receipt.transactionHash) as `0x${string}`,
                                blockHash: null,
                                removed: false,
                            })
                        }
                        if (dukerLogs.length > 0 && receipt.transactionHash) {
                            txHashes.push(receipt.transactionHash)
                        }
                    }

                    if (allDukerLogs.length === 0) {
                        return Response.json({ success: true, message: 'No DukerEvent logs', eventsProcessed: 0 })
                    }

                    console.log(`[notify-txs] ${allDukerLogs.length} DukerEvent(s) from ${txHashes.length} tx(s)`)

                    // Parse + convert + apply
                    const parsedLogs = parseEventLogs({ abi: dukerNewsAbi, logs: allDukerLogs, eventName: 'DukerEvent' })
                    const events = await getEventsFromWebhookLogs(parsedLogs)
                    const results = await applyEvents(events)

                    const elapsed = Date.now() - startTime
                    console.log(`[notify-txs] Applied ${results.length} event(s) in ${elapsed}ms`)

                    return Response.json({
                        success: true,
                        eventsProcessed: results.length,
                        txHashes,
                        elapsed,
                        events: results.map(r => ({ evtSeq: r.evtSeq, eventType: r.eventType, username: r.username })),
                    })

                } catch (e: any) {
                    console.error('[notify-txs] Error:', e)
                    return Response.json(
                        { success: false, message: e?.message || 'Unknown error' },
                        { status: 200 } // 200 to avoid QuickNode retries on app errors
                    )
                }
            },
        },
    },
})
