/**
 * POST /api/x402/submit-post — Gasless post submission via x402.
 *
 * Flow:
 *   1. Auth via middleware → get address + username
 *   2. settleX402Payment():
 *      - XLayer + paymentPayload → OKX verify + settle (real USDT transfer)
 *      - local/Sepolia or no payload → mock mint (dev simulation)
 *   3. Operator calls DukerNews.submitPostViaX402() → emits DukerEvent
 *   4. Return txHash to frontend
 */
import { createFileRoute } from '@tanstack/react-router'
import { createPublicClient, createWalletClient, http, keccak256, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { getHomeChain } from '../../../lib/server-chain'
import { dukerNewsAbi } from '@alm/duker-dao-contract'
import { settleX402Payment } from '../../../lib/x402-settlement'
import type { OkxPaymentPayload } from '../../../services/okx402-service'
import { requireAuthMiddleware } from '../../../middleware'

// Deployer / operator key — reads from env, falls back to Anvil account #0 for local dev
const DEPLOYER_KEY = (process.env.OPERATOR_PRIVATE_KEY ||
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as `0x${string}`

// Proto enum values
const AGG_TYPE_POST = 2
const EVT_TYPE_POST_CREATED = 1

export const Route = createFileRoute('/api/x402/submit-post')({
    server: {
        middleware: [requireAuthMiddleware],
        handlers: {
            POST: async ({ request, context }) => {
                try {
                    const payload = context.auth!

                    // Parse request
                    const body = await request.json() as {
                        eventDataHex: string        // protobuf EventData bytes as hex
                        amount?: number             // marketing boost amount (USDT)
                        /** EIP-3009 signed payload from frontend (required on XLayer) */
                        paymentPayload?: OkxPaymentPayload
                    }
                    const { eventDataHex, amount = 0, paymentPayload } = body
                    if (!eventDataHex || !eventDataHex.startsWith('0x')) {
                        return Response.json({ success: false, message: 'Invalid eventDataHex' }, { status: 400 })
                    }

                    const userAddress = payload.ego as `0x${string}`
                    const { addrs, viemChain, rpcUrl } = getHomeChain()
                    const amountMicro = BigInt(Math.round((amount || 0) * 1_000_000))

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

                    // === Step 1: Settle payment (if boost > 0) ===
                    const { paymentTxHash } = await settleX402Payment({
                        amountMicro,
                        userAddress,
                        paymentPayload,
                        description: 'DukerNews post submission',
                    })

                    // Idempotency nonce
                    const paymentNonce = keccak256(
                        toHex(`x402-post:${userAddress}:${paymentTxHash}`)
                    )

                    // Call submitPostViaX402
                    const txHash = await walletClient.writeContract({
                        chain: viemChain as any,
                        address: addrs.DukerNews,
                        abi: dukerNewsAbi,
                        functionName: 'submitPostViaX402',
                        args: [
                            userAddress,
                            AGG_TYPE_POST,
                            BigInt(0),              // aggId = 0 → create new
                            EVT_TYPE_POST_CREATED,
                            eventDataHex as `0x${string}`,
                            amountMicro,            // USDT amount (6 decimals)
                            paymentNonce as `0x${string}`,
                        ],
                    })
                    await publicClient.waitForTransactionReceipt({ hash: txHash })

                    return Response.json({
                        success: true,
                        txHash,
                        paymentNonce,
                        amount,
                    })
                } catch (e: any) {
                    console.error('[x402/submit-post] Error:', e)
                    return Response.json(
                        { success: false, message: e?.shortMessage || e?.message || 'x402 submit failed' },
                        { status: 500 }
                    )
                }
            },
        },
    },
})
