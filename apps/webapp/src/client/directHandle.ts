/**
 * directHandle.ts — Direct (user-pays-gas) on-chain handler.
 *
 * Handles the "direct" branch of useChainHandle:
 *   Switches on evtType → approve stablecoin → call contract → notifyTx
 *
 * Separated from useChainHandle.ts for clarity.
 */

import { toBinary } from '@bufbuild/protobuf'
import { toHex } from 'viem'
import { EventType, EventDataSchema, type DukerTxReq } from '@repo/apidefs'
import { ADDRESSES, dukerNewsAbi, ERC20_ABI, DEFAULT_CHAIN_ID, getDefaultStablecoin } from '../lib/contracts'
import { notifyTx, refreshAuth } from './auth-api'
import type { NotifyTxResult, AuthRefreshResult } from './auth-api'

const AGG_TYPE_POST = 2
const EVT_TYPE_POST_CREATED = 1

export interface DirectHandleResult {
    txHash: string
    notifyResult?: NotifyTxResult
    authResult?: AuthRefreshResult
}

interface DirectHandleCtx {
    address: `0x${string}`
    writeContractAsync: (args: any) => Promise<`0x${string}`>
    waitForReceipt: (hash: `0x${string}`) => Promise<void>
    readContract: (args: any) => Promise<any>
    onStep: (step: 'approving' | 'executing' | 'confirming') => void
}

/**
 * Execute a direct (gas-paying) on-chain transaction.
 * Caller provides wagmi primitives via ctx; this function handles the switch.
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

            // Approve stablecoin
            ctx.onStep('approving')
            const approveTx = await ctx.writeContractAsync({
                address: stablecoin.address,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [addrs.DukerNews, amountMicro],
            })
            await ctx.waitForReceipt(approveTx)

            // Call mintUsername
            ctx.onStep('executing')
            const mintTx = await ctx.writeContractAsync({
                address: addrs.DukerNews,
                abi: dukerNewsAbi,
                functionName: 'mintUsername',
                args: [username, amountMicro, BigInt(dukiBps)],
            })

            // Notify backend + refresh JWT
            ctx.onStep('confirming')
            let notifyResult: NotifyTxResult | undefined
            let authResult: AuthRefreshResult | undefined
            try { notifyResult = await notifyTx(mintTx, dukiBps) } catch { /* best-effort */ }
            try { authResult = await refreshAuth(dukiBps, mintTx) } catch { /* best-effort */ }

            return { txHash: mintTx, notifyResult, authResult }
        }

        case EventType.POST_CREATED: {
            const payload = txData.data?.payload
            if (payload?.case !== 'postCreated') throw new Error('Missing postCreated payload')
            const amountMicro = BigInt(payload.value.boostAmount)

            const hexData = txData.data
                ? toHex(toBinary(EventDataSchema, txData.data))
                : ('0x' as `0x${string}`)

            // Approve stablecoin (if marketing boost > 0)
            if (amountMicro > 0n) {
                ctx.onStep('approving')
                const allowance = await ctx.readContract({
                    address: stablecoin.address,
                    abi: ERC20_ABI,
                    functionName: 'allowance',
                    args: [ctx.address, addrs.DukerNews],
                }) as bigint
                if (allowance < amountMicro) {
                    const approveTx = await ctx.writeContractAsync({
                        address: stablecoin.address,
                        abi: ERC20_ABI,
                        functionName: 'approve',
                        args: [addrs.DukerNews, amountMicro],
                    })
                    await ctx.waitForReceipt(approveTx)
                }
            }

            // Call submitPost
            ctx.onStep('executing')
            const postTx = await ctx.writeContractAsync({
                address: addrs.DukerNews,
                abi: dukerNewsAbi,
                functionName: 'submitPost',
                args: [AGG_TYPE_POST, BigInt(0), EVT_TYPE_POST_CREATED, hexData, amountMicro],
            })

            // Notify backend
            ctx.onStep('confirming')
            let notifyResult: NotifyTxResult | undefined
            try { notifyResult = await notifyTx(postTx) } catch { /* best-effort */ }

            return { txHash: postTx, notifyResult }
        }

        case EventType.COMMENT_CREATED:
        case EventType.COMMENT_DELETED: {
            // submitComment — optional boostAmount (tip)
            const boostMicro = txData.data?.payload?.case === 'commentCreated'
                ? BigInt(txData.data.payload.value.boostAmount ?? 0)
                : 0n

            const hexData = txData.data
                ? toHex(toBinary(EventDataSchema, txData.data))
                : ('0x' as `0x${string}`)

            // Approve stablecoin if boost > 0
            if (boostMicro > 0n) {
                ctx.onStep('approving')
                const allowance = await ctx.readContract({
                    address: stablecoin.address,
                    abi: ERC20_ABI,
                    functionName: 'allowance',
                    args: [ctx.address, addrs.DukerNews],
                }) as bigint
                if (allowance < boostMicro) {
                    const approveTx = await ctx.writeContractAsync({
                        address: stablecoin.address,
                        abi: ERC20_ABI,
                        functionName: 'approve',
                        args: [addrs.DukerNews, boostMicro],
                    })
                    await ctx.waitForReceipt(approveTx)
                }
            }

            ctx.onStep('executing')
            const commentTx = await ctx.writeContractAsync({
                address: addrs.DukerNews,
                abi: dukerNewsAbi,
                functionName: 'submitComment',
                args: [txData.aggType, BigInt(txData.aggId ?? 0), txData.evtType, hexData, boostMicro],
            })

            ctx.onStep('confirming')
            let notifyResult: NotifyTxResult | undefined
            try { notifyResult = await notifyTx(commentTx) } catch { /* best-effort */ }

            return { txHash: commentTx, notifyResult }
        }

        case EventType.COMMENT_AMEND: {
            // amendComment — always free, no stablecoin
            const hexData = txData.data
                ? toHex(toBinary(EventDataSchema, txData.data))
                : ('0x' as `0x${string}`)

            ctx.onStep('executing')
            const amendTx = await ctx.writeContractAsync({
                address: addrs.DukerNews,
                abi: dukerNewsAbi,
                functionName: 'amendComment',
                args: [txData.aggType, BigInt(txData.aggId ?? 0), txData.evtType, hexData],
            })

            ctx.onStep('confirming')
            let notifyResult: NotifyTxResult | undefined
            try { notifyResult = await notifyTx(amendTx) } catch { /* best-effort */ }

            return { txHash: amendTx, notifyResult }
        }

        case EventType.COMMENT_UPVOTED: {
            // upvoteComment — optional boostAmount (tip)
            const boostMicro = txData.data?.payload?.case === 'commentUpvoted'
                ? BigInt(txData.data.payload.value.boostAmount ?? 0)
                : 0n

            const hexData = txData.data
                ? toHex(toBinary(EventDataSchema, txData.data))
                : ('0x' as `0x${string}`)

            if (boostMicro > 0n) {
                ctx.onStep('approving')
                const allowance = await ctx.readContract({
                    address: stablecoin.address,
                    abi: ERC20_ABI,
                    functionName: 'allowance',
                    args: [ctx.address, addrs.DukerNews],
                }) as bigint
                if (allowance < boostMicro) {
                    const approveTx = await ctx.writeContractAsync({
                        address: stablecoin.address,
                        abi: ERC20_ABI,
                        functionName: 'approve',
                        args: [addrs.DukerNews, boostMicro],
                    })
                    await ctx.waitForReceipt(approveTx)
                }
            }

            ctx.onStep('executing')
            const upvoteTx = await ctx.writeContractAsync({
                address: addrs.DukerNews,
                abi: dukerNewsAbi,
                functionName: 'upvoteComment',
                args: [txData.aggType, BigInt(txData.aggId ?? 0), txData.evtType, hexData, boostMicro],
            })

            ctx.onStep('confirming')
            let notifyResult: NotifyTxResult | undefined
            try { notifyResult = await notifyTx(upvoteTx) } catch { /* best-effort */ }

            return { txHash: upvoteTx, notifyResult }
        }

        default:
            throw new Error(`Unsupported evtType: ${txData.evtType}`)
    }
}
