/**
 * x402-service.ts — Unified gasless (x402) on-chain handler.
 *
 * Handles CmdService.X402Handle RPC:
 *   - Switches on evt_type to call the right contract function
 *   - Simulates x402 USDT settlement (local dev: operator mints to contract)
 *   - Pulls events from tx receipt → applies to DB
 *   - Returns PbDeltaEventsResp with applied events
 */

import { create, toBinary } from '@bufbuild/protobuf'
import { createPublicClient, createWalletClient, http, keccak256, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { EventType, EventDataSchema, PbDeltaEventsRespSchema } from '@repo/apidefs'
import type { DukerTxReq } from '@repo/apidefs'
import { getHomeChain } from '../lib/server-chain'
import { getDefaultStablecoin, getStablecoins } from '../lib/contracts'
import { dukerNewsAbi, mockUsdtAbi } from '@alm/duker-dao-contract'
import { applyEvents } from './events-service'
import { getEventsFromTx } from './blockchain-service'

// Deployer / operator key — reads from env, falls back to Anvil account #0 for local dev
const DEPLOYER_KEY = (process.env.OPERATOR_PRIVATE_KEY ||
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as `0x${string}`

// Proto enum values
const AGG_TYPE_POST = 2
const EVT_TYPE_POST_CREATED = 1

/**
 * Handle a gasless x402 transaction request.
 * Called by CmdService.X402Handle ConnectRPC handler.
 *
 * Home chain = where DukerNews contract lives (always env-driven).
 * Payment chain = where x402 settles the stablecoin (from req.paymentChain).
 * For now (dev simulation), both are the same chain.
 * In production, x402 will settle on the payment chain and we verify settlement
 * before calling the home chain contract.
 */
export async function x402Handle(req: DukerTxReq) {
    const { addrs, viemChain, rpcUrl, chainId } = getHomeChain()
    const defaultStable = getDefaultStablecoin(chainId)
    // Validate client-provided stablecoin address against known list; fallback to default
    // TODO: in production, resolve stablecoin from payment chain, not home chain
    const stablecoins = getStablecoins(chainId)
    const clientAddr = req.paymentStablecoinAddress?.toLowerCase()
    const matchedStable = clientAddr
        ? stablecoins.find(s => s.address.toLowerCase() === clientAddr)
        : undefined
    const stablecoin = matchedStable ?? defaultStable
    const publicClient = createPublicClient({ chain: viemChain as any, transport: http(rpcUrl) })

    const operatorAccount = privateKeyToAccount(DEPLOYER_KEY)
    const walletClient = createWalletClient({
        account: operatorAccount,
        chain: viemChain as any,
        transport: http(rpcUrl),
    })
    const userAddress = req.address as `0x${string}`
    if (!userAddress) throw new Error('address is required')

    // Serialize EventData to hex bytes for the contract
    const eventDataBytes = req.data
        ? toBinary(EventDataSchema, req.data)
        : new Uint8Array()
    const eventDataHex = toHex(eventDataBytes)

    let txHash: `0x${string}`

    switch (req.evtType) {
        case EventType.USER_MINTED: {
            const payload = req.data?.payload
            if (payload?.case !== 'userMinted') throw new Error('USER_MINTED: missing userMinted payload')
            const { username, mintAmount, dukiBps } = payload.value

            if (!username || username.length < 2) throw new Error('Invalid username')
            const amountMicro = BigInt(mintAmount)
            if (amountMicro <= 0n) throw new Error('Invalid amount')

            // Simulate x402 settle: mint USDT to contract
            const mintUsdtHash = await walletClient.writeContract({
                address: stablecoin.address,
                abi: mockUsdtAbi,
                functionName: 'mint',
                args: [addrs.DukerNews, amountMicro],
            })
            await publicClient.waitForTransactionReceipt({ hash: mintUsdtHash })

            // Generate idempotency nonce
            const paymentNonce = keccak256(
                toHex(`x402:${userAddress}:${username}:${Date.now()}`)
            )

            // Call mintUsernameViaX402
            txHash = await walletClient.writeContract({
                address: addrs.DukerNews,
                abi: dukerNewsAbi,
                functionName: 'mintUsernameViaX402',
                args: [userAddress, username, amountMicro, BigInt(dukiBps), paymentNonce as `0x${string}`],
            })
            await publicClient.waitForTransactionReceipt({ hash: txHash })
            break
        }

        case EventType.POST_CREATED: {
            const payload = req.data?.payload
            if (payload?.case !== 'postCreated') throw new Error('POST_CREATED: missing postCreated payload')
            const amountMicro = BigInt(payload.value.boostAmount)

            // Simulate x402 settle for marketing boost
            if (amountMicro > 0n) {
                const mintUsdtHash = await walletClient.writeContract({
                    address: stablecoin.address,
                    abi: mockUsdtAbi,
                    functionName: 'mint',
                    args: [addrs.DukerNews, amountMicro],
                })
                await publicClient.waitForTransactionReceipt({ hash: mintUsdtHash })
            }

            // Generate idempotency nonce
            const paymentNonce = keccak256(
                toHex(`x402-post:${userAddress}:${Date.now()}`)
            )

            // Call submitPostViaX402
            txHash = await walletClient.writeContract({
                address: addrs.DukerNews,
                abi: dukerNewsAbi,
                functionName: 'submitPostViaX402',
                args: [
                    userAddress,
                    AGG_TYPE_POST,
                    BigInt(req.aggId),
                    EVT_TYPE_POST_CREATED,
                    eventDataHex as `0x${string}`,
                    amountMicro,
                    paymentNonce as `0x${string}`,
                ],
            })
            await publicClient.waitForTransactionReceipt({ hash: txHash })
            break
        }

        case EventType.COMMENT_CREATED:
        case EventType.COMMENT_DELETED: {
            // submitComment / delete — optional boostAmount (tip)
            const boostMicro = req.data?.payload?.case === 'commentCreated'
                ? BigInt(req.data.payload.value.boostAmount ?? 0)
                : 0n

            // Simulate x402 settle: mint USDT to contract if boost > 0
            if (boostMicro > 0n) {
                const mintUsdtHash = await walletClient.writeContract({
                    address: stablecoin.address,
                    abi: mockUsdtAbi,
                    functionName: 'mint',
                    args: [addrs.DukerNews, boostMicro],
                })
                await publicClient.waitForTransactionReceipt({ hash: mintUsdtHash })
            }

            const paymentNonce = keccak256(
                toHex(`x402-comment:${userAddress}:${Date.now()}`)
            )

            txHash = await walletClient.writeContract({
                address: addrs.DukerNews,
                abi: dukerNewsAbi,
                functionName: 'submitCommentViaX402',
                args: [
                    userAddress,
                    req.aggType,
                    BigInt(req.aggId),
                    req.evtType,
                    eventDataHex as `0x${string}`,
                    boostMicro,
                    paymentNonce as `0x${string}`,
                ],
            })
            await publicClient.waitForTransactionReceipt({ hash: txHash })
            break
        }

        case EventType.COMMENT_AMEND: {
            // amendComment — always free, no USDT
            const paymentNonce = keccak256(
                toHex(`x402-amend:${userAddress}:${Date.now()}`)
            )

            txHash = await walletClient.writeContract({
                address: addrs.DukerNews,
                abi: dukerNewsAbi,
                functionName: 'amendCommentViaX402',
                args: [
                    userAddress,
                    req.aggType,
                    BigInt(req.aggId),
                    req.evtType,
                    eventDataHex as `0x${string}`,
                    paymentNonce as `0x${string}`,
                ],
            })
            await publicClient.waitForTransactionReceipt({ hash: txHash })
            break
        }

        case EventType.COMMENT_UPVOTED: {
            // upvoteComment — optional boostAmount (tip)
            const boostMicro = req.data?.payload?.case === 'commentUpvoted'
                ? BigInt((req.data.payload.value as any).boostAmount ?? 0)
                : 0n

            if (boostMicro > 0n) {
                const mintUsdtHash = await walletClient.writeContract({
                    address: stablecoin.address,
                    abi: mockUsdtAbi,
                    functionName: 'mint',
                    args: [addrs.DukerNews, boostMicro],
                })
                await publicClient.waitForTransactionReceipt({ hash: mintUsdtHash })
            }

            const paymentNonce = keccak256(
                toHex(`x402-upvote:${userAddress}:${Date.now()}`)
            )

            txHash = await walletClient.writeContract({
                address: addrs.DukerNews,
                abi: dukerNewsAbi,
                functionName: 'upvoteCommentViaX402',
                args: [
                    userAddress,
                    req.aggType,
                    BigInt(req.aggId),
                    req.evtType,
                    eventDataHex as `0x${string}`,
                    boostMicro,
                    paymentNonce as `0x${string}`,
                ],
            })
            await publicClient.waitForTransactionReceipt({ hash: txHash })
            break
        }

        default:
            throw new Error(`Unsupported evt_type: ${req.evtType}`)
    }

    // Apply events from the tx to DB
    let events: any[] = []
    try {
        events = await getEventsFromTx(txHash)
        if (events.length > 0) {
            await applyEvents(events)
        }
    } catch (e: any) {
        console.warn('[X402Handle] applyEvents:', e?.message)
    }

    return create(PbDeltaEventsRespSchema, { events })
}
