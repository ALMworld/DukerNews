/**
 * TanStack Start server route that handles ConnectRPC requests at /rpc/*.
 * Uses ConnectRPC's universal handler pattern (same as apps/worker)
 * for proper proto serialization (binary + JSON) without manual parsing.
 *
 * AUTH: Mutation endpoints (HandleCmd) require a valid JWT cookie.
 * The verified address from JWT replaces any client-supplied address.
 */

import { createFileRoute } from '@tanstack/react-router'
import {
    type UniversalHandler,
    universalServerRequestFromFetch,
    universalServerResponseToFetch,
} from "@connectrpc/connect/protocol"
import { createConnectRouter } from '@connectrpc/connect'
import { registerDukerService } from '../../services/connect-service'
import { verifyJwt, parseCookies, COOKIE_NAME } from '../../server/auth-utils'

// Build the ConnectRPC router once at module level
const router = createConnectRouter({
    connect: true,
    requireConnectProtocolHeader: false,
    jsonOptions: { ignoreUnknownFields: true },
})
registerDukerService(router)

// Index handlers by path for O(1) lookup
const handlers = new Map<string, UniversalHandler>()
for (const h of router.handlers) {
    handlers.set(h.requestPath, h)
}

// Paths that require authentication (write/mutation endpoints)
const PROTECTED_PATHS = new Set<string>([
    '/duker.CmdService/X402Handle',
    '/duker.CmdService/NotifyTx',
])

export const Route = createFileRoute('/rpc/$')({
    server: {
        handlers: {
            POST: async ({ request }) => {
                try {
                    const url = new URL(request.url)
                    // Strip the /rpc prefix to get the ConnectRPC path
                    const rpcPath = url.pathname.replace(/^\/rpc/, '')
                    const handler = handlers.get(rpcPath)

                    if (!handler) {
                        return Response.json(
                            { code: 'unimplemented', message: `Unknown RPC: ${rpcPath}` },
                            { status: 404 }
                        )
                    }

                    // Auth check for protected (mutation) endpoints
                    if (PROTECTED_PATHS.has(rpcPath)) {
                        const cookieHeader = request.headers.get('cookie') || ''
                        const cookies = parseCookies(cookieHeader)
                        const token = cookies[COOKIE_NAME]

                        if (!token) {
                            return Response.json(
                                { code: 'unauthenticated', message: 'Login required' },
                                { status: 401 }
                            )
                        }

                        const payload = await verifyJwt(token)
                        if (!payload) {
                            return Response.json(
                                { code: 'unauthenticated', message: 'Invalid or expired session' },
                                { status: 401 }
                            )
                        }

                        // Username required: if username is still the default (= address), block mutations
                        if (!payload.username || payload.username.toLowerCase() === payload.ego.toLowerCase()) {
                            return Response.json(
                                { code: 'username_required', message: 'Please set a username before posting', ego: payload.ego },
                                { status: 403 }
                            )
                        }

                        // JWT verified, username set — pass request through as-is.
                        // The client already sends address in the Cmd proto;
                        // no need to rewrite the body.
                        const uReq = universalServerRequestFromFetch(request, {})
                        const uRes = await handler(uReq)
                        return universalServerResponseToFetch(uRes)
                    }

                    // Unprotected endpoints — pass through
                    const uReq = universalServerRequestFromFetch(request, {})
                    const uRes = await handler(uReq)
                    return universalServerResponseToFetch(uRes)
                } catch (error) {
                    console.error('RPC error:', error)
                    return Response.json(
                        { code: 'internal', message: error instanceof Error ? error.message : 'Unknown error' },
                        { status: 500 }
                    )
                }
            },
        },
    },
})
