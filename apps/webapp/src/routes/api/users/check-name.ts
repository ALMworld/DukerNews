/**
 * GET /api/users/check-name?name=xxx
 * Returns { available: boolean } — checks local D1 users table.
 * TODO: Add a CheckUsername RPC to the registry worker for authoritative check.
 */
import { createFileRoute } from '@tanstack/react-router'
import { getKysely } from '../../../lib/db'

export const Route = createFileRoute('/api/users/check-name')({
    server: {
        handlers: {
            GET: async ({ request }) => {
                const url = new URL(request.url)
                const name = url.searchParams.get('name')?.trim()

                if (!name) {
                    return Response.json({ available: false, reason: 'empty' })
                }

                const db = getKysely()
                if (!db) {
                    return Response.json({ available: true })
                }

                const row = await db
                    .selectFrom('users')
                    .select('address')
                    .where('username', '=', name)
                    .executeTakeFirst()

                return Response.json({ available: !row })
            },
        },
    },
})

