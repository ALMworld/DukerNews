import { createFileRoute } from '@tanstack/react-router'
import {
    verifyJwt,
    signJwt,
    parseCookies,
    buildCookieHeader,
    getJwtExpirySecs,
    COOKIE_NAME,
    type JWTPayload,
} from '../../../server/auth-utils'
import { getRegistryIdentity } from '../../../server/registry-worker-client'
import { DEFAULT_CHAIN_ID } from '../../../lib/contracts'
import { getKysely } from '../../../lib/db'

const CHAIN_ID_TO_EID: Record<number, number> = {
    31337: 31337,
    196: 30274,
    11155111: 11155111,
}

export const Route = createFileRoute('/api/auth/refresh')({
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
                    return Response.json({ success: false, message: 'Invalid session' }, { status: 401 })
                }

                // Guard: only refresh when username is empty (one-time after mint)
                if (payload.username) {
                    return Response.json({ success: false, message: 'Token already has username' })
                }

                // Read dukiBps and txHash from request body
                let dukiBps: number | undefined
                try {
                    const body = await request.json() as { dukiBps?: number }
                    dukiBps = body.dukiBps
                } catch {
                    // body is optional — defaults to undefined
                }

                const address = payload.ego
                const chainEid = CHAIN_ID_TO_EID[DEFAULT_CHAIN_ID] ?? DEFAULT_CHAIN_ID

                // Query registry worker for on-chain username (avoids workerd outbound restriction)
                const identity = await getRegistryIdentity(address, chainEid)
                if (!identity?.username) {
                    return Response.json({ success: false, message: 'No username found — registry worker may not have indexed yet' })
                }

                // Persist to webapp D1 so login can find it next time
                try {
                    const db = getKysely()
                    if (db) {
                        const now = Math.floor(Date.now() / 1000)
                        await db
                            .insertInto('users')
                            .values({
                                address: address.toLowerCase(),
                                username: identity.username,
                                duki_bps: dukiBps ?? 0,
                                karma: 1,
                                created_at: now,
                                updated_at: now,
                            })
                            .onConflict((oc) =>
                                oc.column('address').doUpdateSet({
                                    username: identity.username,
                                    duki_bps: dukiBps ?? 0,
                                    updated_at: now,
                                })
                            )
                            .execute()
                    }
                } catch (e) {
                    console.warn('[auth/refresh] D1 upsert failed (non-blocking):', e)
                }

                // Re-issue JWT with verified on-chain username
                const newPayload: JWTPayload = {
                    ...payload,
                    username: identity.username,
                    dukiBps: dukiBps ?? 0,
                    expireAt: Math.floor(Date.now() / 1000) + getJwtExpirySecs(),
                }

                const newToken = await signJwt(newPayload)

                return new Response(
                    JSON.stringify({ success: true, data: newPayload }),
                    {
                        status: 200,
                        headers: {
                            'Content-Type': 'application/json',
                            'Set-Cookie': buildCookieHeader(newToken),
                        },
                    }
                )
            },
        },
    },
})

