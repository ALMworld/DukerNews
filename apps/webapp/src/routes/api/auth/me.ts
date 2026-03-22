/**
 * POST /api/auth/me — Check current session from JWT cookie.
 */
import { createFileRoute } from '@tanstack/react-router'
import { verifyJwt, parseCookies, COOKIE_NAME } from '../../../server/auth-utils'

export const Route = createFileRoute('/api/auth/me')({
    server: {
        handlers: {
            POST: async ({ request }) => {
                const cookieHeader = request.headers.get('cookie') || ''
                const cookies = parseCookies(cookieHeader)
                const token = cookies[COOKIE_NAME]

                if (!token) {
                    return Response.json({ success: false, message: 'Not logged in' }, { status: 401 })
                }

                const payload = await verifyJwt(token)
                if (!payload) {
                    return Response.json({ success: false, message: 'Invalid or expired session' }, { status: 401 })
                }

                return Response.json({ success: true, data: payload })
            },
        },
    },
})
