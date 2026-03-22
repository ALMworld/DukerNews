/**
 * POST /api/auth/refresh — Verify on-chain username, persist to DB, re-issue JWT.
 *
 * Called once after minting a username on-chain.
 * Flow:
 *   1. Read JWT → get address (guard: only when username is empty)
 *   2. Read on-chain: DukerNews.usernameOf(address)
 *   3. If found → GoAPI MINT_USER to persist to DB
 *   4. Re-issue JWT with verified username + Set-Cookie
 */
import { createFileRoute } from '@tanstack/react-router'
import { createPublicClient, http } from 'viem'
import { dukerNewsAbi } from '../../../lib/contracts'
import { getHomeChain } from '../../../lib/server-chain'
import {
    verifyJwt,
    signJwt,
    parseCookies,
    buildCookieHeader,
    getJwtExpirySecs,
    COOKIE_NAME,
    type JWTPayload,
} from '../../../server/auth-utils'

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
                let txHash: string | undefined
                try {
                    const body = await request.json() as { dukiBps?: number; txHash?: string }
                    dukiBps = body.dukiBps
                    txHash = body.txHash
                } catch {
                    // body is optional — defaults to undefined
                }

                const address = payload.ego

                // Step 1: Read on-chain username from DukerNews
                const { addrs, viemChain, rpcUrl } = getHomeChain()
                const publicClient = createPublicClient({
                    chain: viemChain as any,
                    transport: http(rpcUrl),
                })

                // If txHash provided, wait for confirmation before reading
                if (txHash) {
                    try {
                        await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` })
                    } catch (e: any) {
                        return Response.json({ success: false, message: `Tx not confirmed: ${e?.message}` })
                    }
                }

                let onChainUsername: string
                try {
                    onChainUsername = await publicClient.readContract({
                        address: addrs.DukerNews,
                        abi: dukerNewsAbi,
                        functionName: 'usernameOf',
                        args: [address as `0x${string}`],
                    }) as string
                } catch (e: any) {
                    return Response.json({ success: false, message: `Failed to read on-chain username: ${e?.message}` })
                }

                if (!onChainUsername) {
                    return Response.json({ success: false, message: 'No username found on-chain for this address' })
                }

                // Step 2: Persist to DB via GoAPI MINT_USER
                // if (MIGRATED) {
                //     try {
                //         const cmdClient = createClient(CmdService, getGoApiTransport())
                //         await cmdClient.handleCmd(create(CmdSchema, {
                //             address,
                //             cmdType: CmdType.MINT_USER,
                //             data: create(CmdDataSchema, {
                //                 payload: { case: 'mintUser', value: { address, username: onChainUsername } },
                //             }),
                //         }))
                //     } catch (e: any) {
                //         // If MINT_USER fails (e.g. already minted), that's OK — DB may already have it
                //         console.warn('[auth/refresh] MINT_USER:', e?.message)
                //     }
                // }

                // Step 3: Re-issue JWT with verified on-chain username
                const newPayload: JWTPayload = {
                    ...payload,
                    username: onChainUsername,
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
