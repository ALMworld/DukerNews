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
import { getEventsFromTx } from '../../../services/blockchain-service'
import { applyEvents } from '../../../services/events-service'

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

                // Idempotent fast path — callers may refresh repeatedly.
                if (payload.username) {
                    return Response.json({ success: true, data: payload })
                }

                const db = getKysely()

                // Read dukiBps and txHash from request body
                let dukiBps: number | undefined
                let txHash: string | undefined
                try {
                    const body = await request.json() as { dukiBps?: number; txHash?: string }
                    dukiBps = body.dukiBps
                    txHash = body.txHash
                } catch {
                    // body is optional — defaults to undefined
                }

                const address = payload.ego
                const chainEid = CHAIN_ID_TO_EID[DEFAULT_CHAIN_ID] ?? DEFAULT_CHAIN_ID

                // First sync DukerNews events when the mint tx is known.
                if (txHash) {
                    try {
                        const events = await getEventsFromTx(txHash)
                        if (events.length > 0) {
                            await applyEvents(events)
                        }
                    } catch (e) {
                        console.warn('[auth/refresh] tx sync failed (non-blocking):', e)
                    }
                }

                let username = ''

                // Preferred source after SIWE: local DB hydrated from DukerNews events.
                if (db) {
                    const existingUser = await db
                        .selectFrom('users')
                        .select(['username', 'duki_bps'])
                        .where('address', '=', address.toLowerCase())
                        .executeTakeFirst()

                    if (existingUser?.username) {
                        username = existingUser.username
                        if (dukiBps == null && existingUser.duki_bps != null) {
                            dukiBps = existingUser.duki_bps
                        }
                    }
                }

                // Final fallback: registry lookup only for authenticated users
                // whose local user row has not been materialized yet.
                if (!username) {
                    const identity = await getRegistryIdentity(address, chainEid)
                    if (identity?.username) {
                        username = identity.username
                    }
                }

                if (!username) {
                    return Response.json({ success: false, message: 'No username found — backend sync has not caught up yet' })
                }

                // Persist to webapp D1 so login can find it next time
                try {
                    if (db) {
                        const now = Math.floor(Date.now() / 1000)
                        await db
                            .insertInto('users')
                            .values({
                                address: address.toLowerCase(),
                                username,
                                duki_bps: dukiBps ?? 0,
                                karma: 1,
                                created_at: now,
                                updated_at: now,
                            })
                            .onConflict((oc) =>
                                oc.column('address').doUpdateSet({
                                    username,
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
                    username,
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
