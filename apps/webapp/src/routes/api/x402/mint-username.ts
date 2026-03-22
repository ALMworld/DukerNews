/**
 * POST /api/x402/mint-username — Gasless username mint via x402 simulation.
 *
 * Flow:
 *   1. Auth via middleware → get address
 *   2. Use deployer key to simulate x402 settle:
 *      a. Transfer USDT from user to X402 contract (via transferFrom after approve)
 *      b. Call X402.mintUsernameViaX402(user, name, amount, dukiBps, fakeTxHash)
 *   3. Persist to DB via GoAPI MINT_USER
 *   4. Re-issue JWT with username + dukiBps
 *
 * In production, step 2 would use actual OKX x402 verify+settle.
 */
import { createFileRoute } from '@tanstack/react-router'
import { createPublicClient, createWalletClient, http, keccak256, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { getHomeChain } from '../../../lib/server-chain'
import { getDefaultStablecoin, getStablecoins } from '../../../lib/contracts'
import { dukerNewsAbi, mockUsdtAbi } from '@alm/duker-dao-contract'
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
                        amount: number    // USDT in whole units (e.g. 1 = 1 USDT)
                        dukiBps: number   // 0-10000
                        paymentStablecoinAddress?: string  // ERC20 address on the payment chain
                    }
                    const { username, amount, dukiBps } = body
                    if (!username || username.length < 2) {
                        return Response.json({ success: false, message: 'Invalid username' })
                    }
                    if (!amount || amount <= 0) {
                        return Response.json({ success: false, message: 'Invalid amount' })
                    }

                    const userAddress = payload.ego as `0x${string}`
                    const amountMicro = BigInt(Math.round(amount * 1_000_000))
                    const { addrs, viemChain, rpcUrl, chainId } = getHomeChain()
                    const defaultStable = getDefaultStablecoin(chainId)
                    // Validate client-provided stablecoin address
                    // TODO: in production, resolve stablecoin from payment chain
                    const stablecoins = getStablecoins(chainId)
                    const clientAddr = body.paymentStablecoinAddress?.toLowerCase()
                    const matchedStable = clientAddr
                        ? stablecoins.find(s => s.address.toLowerCase() === clientAddr)
                        : undefined
                    const stablecoin = matchedStable ?? defaultStable

                    // Set up viem clients
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

                    // === Simulate x402 settle ===
                    // In production, OKX x402 would transfer USDT from user to X402 contract.
                    // For local dev, we simulate by:
                    // 1. Operator mints USDT directly to X402 contract (simulating x402 settle)
                    const mintHash = await walletClient.writeContract({
                        chain: viemChain as any,
                        address: stablecoin.address,
                        abi: mockUsdtAbi,
                        functionName: 'mint',
                        args: [addrs.DukerNews, amountMicro],
                    })
                    await publicClient.waitForTransactionReceipt({ hash: mintHash })

                    // 2. Generate a fake payment txHash for idempotency
                    const paymentTxHash = keccak256(
                        toHex(`x402:${userAddress}:${username}:${Date.now()}`)
                    )

                    // 3. Call DukerNews.mintUsernameViaX402
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
                            paymentTxHash as `0x${string}`,
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
