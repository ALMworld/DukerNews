/**
 * POST /api/auth/login — Verify SIWE signature and issue JWT cookie.
 */
import { createFileRoute } from '@tanstack/react-router'
import { createPublicClient, http, recoverMessageAddress } from 'viem'
import { mainnet } from 'viem/chains'
import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { QueryService } from '@repo/apidefs'
import { getKysely } from '../../../lib/db'
import { MIGRATED } from '../../../lib/grpc-goapi-transport'
import {
    consumeNonce,
    getAddressFromMessage,
    getChainIdFromMessage,
    getNonceFromMessage,
    signJwt,
    buildCookieHeader,
    getJwtExpirySecs,
    type JWTPayload,
} from '../../../server/auth-utils'

export const Route = createFileRoute('/api/auth/login')({
    server: {
        handlers: {
            POST: async ({ request }) => {
                try {
                    const { message, signature } = await request.json() as { message: string; signature: string }
                    if (!message || !signature) {
                        return Response.json({ success: false, message: 'Message and signature are required' })
                    }

                    // Parse SIWE fields
                    const address = getAddressFromMessage(message)
                    const chainId = getChainIdFromMessage(message)
                    const nonce = getNonceFromMessage(message)

                    if (!address) {
                        return Response.json({ success: false, message: 'Could not parse address from message' })
                    }

                    // Validate nonce
                    if (!nonce || !consumeNonce(nonce)) {
                        return Response.json({ success: false, message: 'Invalid or expired nonce' })
                    }

                    // Verify signature — try fast local ecrecover first (EOA),
                    // fall back to on-chain ERC-1271 only for contract wallets.
                    let valid = false
                    try {
                        // Local ECDSA recovery — instant, no RPC needed
                        const recovered = await recoverMessageAddress({
                            message,
                            signature: signature as `0x${string}`,
                        })
                        valid = recovered.toLowerCase() === address.toLowerCase()
                    } catch {
                        // ecrecover failed (e.g. non-standard sig) — ignore
                    }

                    if (!valid) {
                        // Possibly a contract wallet (Safe, Argent, etc.)
                        // Fall back to on-chain ERC-1271 verification
                        try {
                            const publicClient = createPublicClient({
                                chain: mainnet,
                                transport: http(),
                            })
                            valid = await publicClient.verifyMessage({
                                message,
                                address: address as `0x${string}`,
                                signature: signature as `0x${string}`,
                            })
                        } catch (e) {
                            console.warn('[auth/login] ERC-1271 fallback failed:', e)
                        }
                    }

                    if (!valid) {
                        return Response.json({ success: false, message: 'Signature verification failed' })
                    }

                    // User creation / retrieval
                    const db = getKysely()
                    let username = ''

                    if (db) {
                        // sqlite / D1 path — query only, no insert
                        const existingUser = await db
                            .selectFrom('users')
                            .select(['username'])
                            .where('address', '=', address.toLowerCase())
                            .executeTakeFirst()

                        if (existingUser) {
                            username = existingUser.username || ''
                        }
                    } else if (MIGRATED) {
                        // GoAPI path — username stays '' if user not found (lazy creation via MINT_NAME)
                        const goApiUrl = (globalThis as any).env?.GOAPI_URL ?? 'http://localhost:8090'
                        const mkTransport = () => createConnectTransport({
                            baseUrl: goApiUrl,
                            fetch: (input: any, init: any) => fetch(input, { ...init, redirect: 'manual' }),
                        })
                        const queryClient = createClient(QueryService, mkTransport())
                        try {
                            const u = await queryClient.getUser({ address: address.toLowerCase() }) as any
                            username = (u?.username && u.username !== address.toLowerCase()) ? u.username : ''
                        } catch {
                            // User not found — username stays '' and onboarding handles it
                        }
                    }


                    // Issue JWT
                    const payload: JWTPayload = {
                        ego: address.toLowerCase(),
                        chainId,
                        username,
                        expireAt: Math.floor(Date.now() / 1000) + getJwtExpirySecs(),
                    }

                    const token = await signJwt(payload)

                    return new Response(
                        JSON.stringify({ success: true, message: 'ok', data: payload }),
                        {
                            status: 200,
                            headers: {
                                'Content-Type': 'application/json',
                                'Set-Cookie': buildCookieHeader(token),
                            },
                        }
                    )
                } catch (error) {
                    console.error('[auth/login] Error:', error)
                    return Response.json(
                        { success: false, message: 'Internal error, please try again' },
                        { status: 500 }
                    )
                }
            },
        },
    },
})
