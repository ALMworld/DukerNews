/**
 * POST /api/x402/mint-username — Gasless username mint via x402.
 *
 * Flow:
 *   1. Auth via middleware → get address
 *   2. settleX402Payment():
 *      - XLayer + paymentPayload → OKX verify + settle (real USDT transfer)
 *      - local/Sepolia or no payload → mock mint (dev simulation)
 *   3. Operator calls DukerNews.mintUsernameViaX402()
 *   4. Re-issue JWT with username + dukiBps
 */
import { createFileRoute } from '@tanstack/react-router'
import { createPublicClient, createWalletClient, http, keccak256, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { getHomeChain } from '../../../lib/server-chain'
import { dukerNewsAbi } from '@alm/duker-dao-contract'
import { settleX402Payment } from '../../../lib/x402-settlement'
import type { OkxPaymentPayload } from '../../../services/okx402-service'
import {
    signJwt,
    buildCookieHeader,
    getJwtExpirySecs,
    type JWTPayload,
} from '../../../server/auth-utils'
import { requireLoginMiddleware } from '../../../middleware'

// Deployer / operator key — reads from env, falls back to Anvil account #0 for local dev
const DEPLOYER_KEY = (process.env.OPERATOR_PRIVATE_KEY ||
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as `0x${string}`

export const Route = createFileRoute('/api/x402/mint-username')({
    server: {
        middleware: [requireLoginMiddleware],
        handlers: {
            POST: async ({ request, context }) => {
                try {
                    const payload = context.auth!
                    if (payload.username) {
                        return Response.json({ success: false, message: 'Already has username' })
                    }

                    // Parse request
                    const body = await request.json() as {
                        username: string
                        amount: number               // USDT in whole units (e.g. 1 = 1 USDT)
                        dukiBps: number              // 0-10000
                        paymentStablecoinAddress?: string
                        /** EIP-3009 signed payload from frontend (required on XLayer) */
                        paymentPayload?: OkxPaymentPayload
                    }
                    const { username, amount, dukiBps, paymentPayload } = body
                    if (!username || username.length < 2) {
                        return Response.json({ success: false, message: 'Invalid username' })
                    }
                    if (!amount || amount <= 0) {
                        return Response.json({ success: false, message: 'Invalid amount' })
                    }

                    const userAddress = payload.ego as `0x${string}`
                    const amountMicro = BigInt(Math.round(amount * 1_000_000))
                    const { addrs, viemChain, rpcUrl } = getHomeChain()

                    // Set up viem clients (for operator contract call after settlement)
                    const publicClient = createPublicClient({
                        chain: viemChain as any,
                        transport: http(rpcUrl),
                    })
                    const operatorAccount = privateKeyToAccount(DEPLOYER_KEY)
                    const walletClient = createWalletClient({
                        account: operatorAccount,
                        chain: viemChain as any,
                        transport: http(rpcUrl),
                    })

                    // === Step 1: Settle payment ===
                    // XLayer + paymentPayload → real OKX verify+settle
                    // local/Sepolia or no payload → mock mint
                    const { paymentTxHash } = await settleX402Payment({
                        amountMicro,
                        userAddress,
                        paymentPayload,
                        description: `Mint username @${username}`,
                    })

                    // Idempotency nonce (includes paymentTxHash to prevent replay)
                    const paymentNonce = keccak256(
                        toHex(`x402:${userAddress}:${username}:${paymentTxHash}`)
                    )

                    // === Step 2: Emit event on DukerNews contract ===
                    const mintTxHash = await walletClient.writeContract({
                        chain: viemChain as any,
                        address: addrs.DukerNews,
                        abi: dukerNewsAbi,
                        functionName: 'mintUsernameViaX402',
                        args: [
                            userAddress,
                            username,
                            amountMicro,
                            BigInt(dukiBps),
                            paymentNonce as `0x${string}`,
                        ],
                    })
                    await publicClient.waitForTransactionReceipt({ hash: mintTxHash })

                    // === Persist to DB (DEPRECATED: CmdService removed, events from on-chain) ===
                    // if (MIGRATED) {
                    //     try {
                    //         const cmdClient = createClient(CmdService, getGoApiTransport())
                    //         await cmdClient.handleCmd(create(CmdSchema, {
                    //             address: userAddress,
                    //             cmdType: CmdType.MINT_USER,
                    //             data: create(CmdDataSchema, {
                    //                 payload: { case: 'mintUser', value: { address: userAddress, username } },
                    //             }),
                    //         }))
                    //     } catch (e: any) {
                    //         console.warn('[x402/mint-username] MINT_USER:', e?.message)
                    //     }
                    // }

                    // === Re-issue JWT with username + dukiBps ===
                    const newPayload: JWTPayload = {
                        ...payload,
                        username,
                        dukiBps,
                        expireAt: Math.floor(Date.now() / 1000) + getJwtExpirySecs(),
                    }
                    const newToken = await signJwt(newPayload)

                    return new Response(
                        JSON.stringify({
                            success: true,
                            data: newPayload,
                            txHash: mintTxHash,
                            paymentTxHash,
                        }),
                        {
                            status: 200,
                            headers: {
                                'Content-Type': 'application/json',
                                'Set-Cookie': buildCookieHeader(newToken),
                            },
                        }
                    )
                } catch (e: any) {
                    console.error('[x402/mint-username] Error:', e)
                    return Response.json(
                        { success: false, message: e?.shortMessage || e?.message || 'x402 mint failed' },
                        { status: 500 }
                    )
                }
            },
        },
    },
})
