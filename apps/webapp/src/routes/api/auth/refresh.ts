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
import {
    getRegistryIdentities,
    pickPrimaryIdentity,
    syncRegistryIdentities,
} from '../../../server/registry-worker-client'
import { DEFAULT_CHAIN_ID, getEidForChain } from '../../../lib/contracts'
import { getKysely } from '../../../lib/db'
import { getEventsFromTx } from '../../../services/blockchain-service'
import { applyEvents } from '../../../services/events-service'

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
                const chainEid = getEidForChain(DEFAULT_CHAIN_ID)

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
                let chainIdentitiesJson: string | null = null

                // Preferred source after a successful mint: local DB hydrated from
                // the DukerNews USER_MINTED event applied above. No registry call
                // needed — the registry-worker handles indexing via its own webhook.
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

                // Recovery path used when the mint contract reverted (no txHash) or
                // the DukerNews event sync missed the tx — fall back to the registry
                // worker. A sync nudges the worker to catch up first in case the
                // mint succeeded but its indexer is behind.
                if (!username) {
                    try { await syncRegistryIdentities(chainEid) } catch (e) {
                        console.warn('[auth/refresh] registry sync failed (non-blocking):', e)
                    }

                    const identities = await getRegistryIdentities(address, 0)
                    const primary = pickPrimaryIdentity(identities, chainEid)
                    if (primary) {
                        username = primary.username
                        chainIdentitiesJson = JSON.stringify(
                            identities.map(i => ({
                                chainEid: i.chainEid,
                                username: i.username,
                                tokenId: i.tokenId,
                            })),
                        )
                    }
                }

                if (!username) {
                    return Response.json({ success: false, message: 'No username found — backend sync has not caught up yet' })
                }

                // Persist to webapp D1 so login can find it next time. Only write
                // chain_identities when we actually fetched it; otherwise the local
                // event handler is the source of truth and we leave it alone.
                try {
                    if (db) {
                        const now = Math.floor(Date.now() / 1000)
                        const insertValues = {
                            address: address.toLowerCase(),
                            username,
                            duki_bps: dukiBps ?? 0,
                            karma: 1,
                            created_at: now,
                            updated_at: now,
                            ...(chainIdentitiesJson != null
                                ? { chain_identities: chainIdentitiesJson }
                                : {}),
                        }
                        const updateValues = {
                            username,
                            duki_bps: dukiBps ?? 0,
                            updated_at: now,
                            ...(chainIdentitiesJson != null
                                ? { chain_identities: chainIdentitiesJson }
                                : {}),
                        }
                        await db
                            .insertInto('users')
                            .values(insertValues)
                            .onConflict((oc) => oc.column('address').doUpdateSet(updateValues))
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
