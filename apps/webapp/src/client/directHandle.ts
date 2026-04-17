/**
 * directHandle.ts — Direct (user-pays-gas) on-chain handler.
 *
 * Handles the "direct" branch of useChainHandle:
 *   Switches on evtType → approve stablecoin → call contract → notifyTx (server confirms)
 *
 * Separated from useChainHandle.ts for clarity.
 */

import { toBinary } from '@bufbuild/protobuf'
import { toHex } from 'viem'
import { EventType, EventDataSchema, type DukerTxReq, deflateRaw } from '@repo/apidefs'
import { ADDRESSES, dukerNewsAbi, dukerRegistryAbi, ERC20_ABI, DEFAULT_CHAIN_ID, getDefaultStablecoin, MIN_APPROVE_MICRO } from '../lib/contracts'

function maxBigInt(a: bigint, b: bigint): bigint { return a > b ? a : b }

const AGG_TYPE_POST = 2
const EVT_TYPE_POST_CREATED = 1

/** Serialize + deflate-raw compress EventData for on-chain calldata. */
async function compressedEventHex(data: DukerTxReq['data']): Promise<`0x${string}`> {
    if (!data) return '0x'
    const pbBytes = toBinary(EventDataSchema, data)
    const compressed = await deflateRaw(pbBytes)
    return toHex(compressed)
}

export interface DirectHandleResult {
    txHash: string
}

interface DirectHandleCtx {
    address: `0x${string}`
    writeContractAsync: (args: any) => Promise<`0x${string}`>
    simulateContract: (args: any) => Promise<any>
    waitForReceipt: (hash: `0x${string}`) => Promise<void>
    readContract: (args: any) => Promise<any>
    onStep: (step: 'approving' | 'executing' | 'confirming') => void
}

/** Check allowance, approve only if needed. Shows 'approving' only when tx is required. */
async function ensureAllowance(ctx: DirectHandleCtx, tokenAddr: `0x${string}`, spender: `0x${string}`, amount: bigint) {
    if (amount <= 0n) return
    const allowance = await ctx.readContract({
        address: tokenAddr, abi: ERC20_ABI, functionName: 'allowance',
        args: [ctx.address, spender],
    }) as bigint
    if (allowance >= amount) return
    ctx.onStep('approving')
    const tx = await ctx.writeContractAsync({
        address: tokenAddr, abi: ERC20_ABI, functionName: 'approve',
        args: [spender, maxBigInt(MIN_APPROVE_MICRO, amount)],
    })
    await ctx.waitForReceipt(tx)
}

/**
 * Execute a direct (gas-paying) on-chain transaction.
 */
export async function directHandle(
    txData: DukerTxReq,
    ctx: DirectHandleCtx,
): Promise<DirectHandleResult> {
    const addrs = ADDRESSES[DEFAULT_CHAIN_ID]
    const defaultStable = getDefaultStablecoin(DEFAULT_CHAIN_ID)
    // Use stablecoin from txData if provided (new proto fields), else default
    const stablecoin = txData.paymentStablecoinAddress
        ? { ...defaultStable, address: txData.paymentStablecoinAddress as `0x${string}` }
        : defaultStable

    switch (txData.evtType) {
        case EventType.USER_MINTED: {
            const payload = txData.data?.payload
            if (payload?.case !== 'userMinted') throw new Error('Missing userMinted payload')
            const { username, mintAmount, dukiBps } = payload.value
            const amountMicro = BigInt(mintAmount)

            // If paying, approve DukerRegistry (it routes payment through DukigenRegistry.payTo)
            if (amountMicro > 0n) {
                await ensureAllowance(ctx, stablecoin.address, addrs.DukerRegistry, amountMicro)
            }

            ctx.onStep('executing')
            const contractCall = {
                address: addrs.DukerRegistry,
                abi: dukerRegistryAbi,
                functionName: 'mintUsername' as const,
                args: [
                    username,                                          // displayName
                    dukiBps,                                           // preferDukiBps_
                    amountMicro,                                       // experienceAmount
                    stablecoin.address
                ],
                account: ctx.address,
            }
            try {
                const mintTx = await ctx.writeContractAsync(contractCall)
                return { txHash: mintTx }
            } catch (err) {
                // Simulate to decode the actual revert reason (wallet errors are opaque)
                await ctx.simulateContract(contractCall)
                throw err // if simulate didn't throw, rethrow original
            }
        }

        case EventType.POST_CREATED: {
            const payload = txData.data?.payload
            if (payload?.case !== 'postCreated') throw new Error('Missing postCreated payload')
            const amountMicro = BigInt(payload.value.boostAmount)

            const hexData = await compressedEventHex(txData.data)

            // Approve stablecoin if boost > 0
            await ensureAllowance(ctx, stablecoin.address, addrs.DukerNews, amountMicro)

            // Call submitPost
            ctx.onStep('executing')
            const postTx = await ctx.writeContractAsync({
                address: addrs.DukerNews,
                abi: dukerNewsAbi,
                functionName: 'submitPost',
                args: [AGG_TYPE_POST, BigInt(0), EVT_TYPE_POST_CREATED, hexData, amountMicro],
            })

            return { txHash: postTx }
        }

        case EventType.COMMENT_CREATED:
        case EventType.COMMENT_DELETED: {
            // submitComment is always free — no boost
            const hexData = await compressedEventHex(txData.data)

            ctx.onStep('executing')
            const commentTx = await ctx.writeContractAsync({
                address: addrs.DukerNews,
                abi: dukerNewsAbi,
                functionName: 'submitComment',
                args: [txData.aggType, BigInt(txData.aggId ?? 0), txData.evtType, hexData, 0n],
            })

            return { txHash: commentTx }
        }

        case EventType.COMMENT_AMEND: {
            // amendComment — always free, no stablecoin
            const hexData = await compressedEventHex(txData.data)

            ctx.onStep('executing')
            const amendTx = await ctx.writeContractAsync({
                address: addrs.DukerNews,
                abi: dukerNewsAbi,
                functionName: 'amendComment',
                args: [txData.aggType, BigInt(txData.aggId ?? 0), txData.evtType, hexData],
            })

            return { txHash: amendTx }
        }

        // Legacy alias — routes to unified upvoteAttention
        case EventType.COMMENT_UPVOTED:
        case EventType.UPVOTE_ATTENTION: {
            // upvoteAttention — always free, pure social signal (aggType: 2=post, 3=comment)
            const hexData = await compressedEventHex(txData.data)

            ctx.onStep('executing')
            const upvoteTx = await ctx.writeContractAsync({
                address: addrs.DukerNews,
                abi: dukerNewsAbi,
                functionName: 'upvoteAttention',
                args: [txData.aggType, BigInt(txData.aggId ?? 0), txData.evtType, hexData],
            })

            return { txHash: upvoteTx }
        }

        case EventType.BOOST_ATTENTION: {
            // boost — paid economic signal, requires USDT approval
            const p = txData.data?.payload
            const boostMicro = p?.case === 'boostAttention'
                ? BigInt(p.value.boostAmount ?? 0)
                : 0n

            const hexData = await compressedEventHex(txData.data)

            await ensureAllowance(ctx, stablecoin.address, addrs.DukerNews, boostMicro)

            ctx.onStep('executing')
            const boostTx = await ctx.writeContractAsync({
                address: addrs.DukerNews,
                abi: dukerNewsAbi,
                functionName: 'boostAttention',
                args: [txData.aggType, BigInt(txData.aggId ?? 0), txData.evtType, hexData, boostMicro],
            })

            return { txHash: boostTx }
        }

        default:
            throw new Error(`Unsupported evtType: ${txData.evtType}`)
    }
}
