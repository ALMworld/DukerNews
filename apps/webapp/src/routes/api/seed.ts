/**
 * /api/seed — Server route for seeding HN data via event application.
 *
 * Two-phase approach:
 *   1. algoliaToEvents(): Parse Algolia HN JSON → PbEvent[]
 *   2. testApplyEvents(): Apply events to DB (tests event sufficiency)
 *
 * POST /api/seed { item: AlgoliaItem, maxComments?: number }
 */

import { createFileRoute } from '@tanstack/react-router'
import { algoliaToEvents, testApplyEvents } from '../../services/seed-service'

export const Route = createFileRoute('/api/seed')({
    server: {
        handlers: {
            POST: async ({ request }) => {
                try {
                    const body = await request.json()
                    const { item, maxComments = 200 } = body

                    if (!item || !item.id) {
                        return Response.json(
                            { error: 'Missing "item" in request body' },
                            { status: 400 }
                        )
                    }

                    // Phase 1: Algolia JSON → Events
                    const events = algoliaToEvents(item, maxComments)
                    console.log(`[seed] Generated ${events.length} events from HN #${item.id}`)

                    // Phase 2: Apply events to DB
                    const result = await testApplyEvents(events)
                    console.log(`[seed] Applied: post #${result.postId}, ${result.commentsImported} comments`)

                    return Response.json(result)
                } catch (error) {
                    console.error('Seed error:', error)
                    return Response.json(
                        { error: error instanceof Error ? error.message : 'Unknown error' },
                        { status: 500 }
                    )
                }
            },
        },
    },
})
