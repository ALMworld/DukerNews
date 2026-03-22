/**
 * POST /api/auth/logout — Clear the auth cookie.
 */
import { createFileRoute } from '@tanstack/react-router'
import { buildDeleteCookieHeader } from '../../../server/auth-utils'

export const Route = createFileRoute('/api/auth/logout')({
    server: {
        handlers: {
            POST: async () => {
                return new Response(
                    JSON.stringify({ success: true, message: 'ok' }),
                    {
                        status: 200,
                        headers: {
                            'Content-Type': 'application/json',
                            'Set-Cookie': buildDeleteCookieHeader(),
                        },
                    }
                )
            },
        },
    },
})
