/**
 * tx-service.ts — Unified gasless on-chain transaction handler.
 *
 * Payment state machine (for paid operations):
 *   ① verify   → OKX verify (no money moves)
 *   ② persist  → INSERT duker_payments status='verified'
 *   ③ settle   → OKX settle (USDT transferred) → UPDATE status='settled'
 *   ④ execute  → contract call → UPDATE status='executed'
 *
 * Free operations (comment, upvote, amend) skip payment entirely.
 */

import { create, toBinary } from '@bufbuild/protobuf'
import { keccak256, toHex, type TransactionReceipt } from 'viem'
import {
    EventType, EventDataSchema, PbDeltaEventsRespSchema,
    PaymentDataSchema, PaymentScheme,
    deflateRaw,
} from '@repo/apidefs'
import type { DukerTxReq } from '@repo/apidefs'
import { getDukerChainClients } from '../lib/duker-chain'
import { dukerNewsAbi } from '@alm/duker-dao-contract'
import { verifyPayment, settlePayment } from '../lib/payment'
import { applyEvents } from './events-service'
import { getEventsFromWebhookLogs } from './blockchain-service'
import { parseEventLogs } from 'viem'
import { getKysely } from '../lib/db'

// ─── DB helpers (type-safe via Kysely) ──────────────────────────────────────

async function insertPayment(row: {
    id: string
    payer_address: string
    pay_to: string
    amount: number
    token_address: string
    chain_id: number
    evt_type: number
    action_params: string | null
    payment_scheme: string
    payment_data: Uint8Array | null
}) {
    const db = getKysely()
    if (!db) return
    const now = Math.floor(Date.now() / 1000)
    await db.insertInto('duker_payments')
        .values({
            ...row,
            status: 'verified',
            created_at: now,
            updated_at: now,
        })
        .execute()
}

/** Check existing payment status for idempotency. */
async function getPayment(id: string) {
    const db = getKysely()
    if (!db) return null
    const row = await db.selectFrom('duker_payments')
        .select(['id', 'status', 'settle_tx_hash', 'exec_tx_hash'])
        .where('id', '=', id)
        .executeTakeFirst()
    return row ?? null
}

async function updatePaymentStatus(
    id: string,
    status: string,
    extra: Partial<{
        settle_tx_hash: string
        exec_tx_hash: string
        error_msg: string
    }> = {},
) {
    const db = getKysely()
    if (!db) return
    const now = Math.floor(Date.now() / 1000)
    await db.updateTable('duker_payments')
        .set({ status, updated_at: now, ...extra })
        .where('id', '=', id)
        .execute()
}

async function incrementRetryCount(id: string, errorMsg: string) {
    const db = getKysely()
    if (!db) return
    const now = Math.floor(Date.now() / 1000)
    // Kysely doesn't support retry_count + 1 easily on D1,
    // so we use a raw expression
    await db.updateTable('duker_payments')
        .set({
            error_msg: errorMsg.slice(0, 500),
            updated_at: now,
        })
        .where('id', '=', id)
        .execute()
}

// ─── Constants ──────────────────────────────────────────────────────────────

const AGG_TYPE_POST = 2
const EVT_TYPE_POST_CREATED = 1

// ─── Main handler ───────────────────────────────────────────────────────────

export async function handleTx(req: DukerTxReq) {
    console.log(`[handleTx] evtType=${req.evtType} address=${req.address}`)
    try {
        const { addrs, viemChain, publicClient, walletClient, chainId } = getDukerChainClients()
        const chainParam = { chain: viemChain as any }
        const userAddress = req.address as `0x${string}`
        if (!userAddress) throw new Error('address is required')

        // Serialize EventData for contract
        const eventDataBytes = req.data
            ? toBinary(EventDataSchema, req.data)
            : new Uint8Array()
        const compressedBytes = eventDataBytes.length > 0
            ? await deflateRaw(eventDataBytes)
            : eventDataBytes
        const eventDataHex = toHex(compressedBytes)

        const paymentData = req.paymentData
        const tokenAddr = req.paymentStablecoinAddress || ''

        let txHash: `0x${string}`
        let receipt: TransactionReceipt

        switch (req.evtType) {

            // ═══════════════════════════════════════════════════════════════════
            // PAID: USER_MINTED — verify → persist → settle → execute
            // ═══════════════════════════════════════════════════════════════════
            case EventType.USER_MINTED: {
                const payload = req.data?.payload
                if (payload?.case !== 'userMinted') throw new Error('USER_MINTED: missing userMinted payload')
                const { username, mintAmount, dukiBps } = payload.value

                if (!username || username.length < 1) throw new Error('Invalid username')
                const amountMicro = BigInt(mintAmount)
                if (amountMicro <= 10000n) throw new Error('Amount must be > 0.01 USDT')

                // Check DB for existing username before processing payment
                const checkDb = getKysely()
                if (checkDb) {
                    const existingUser = await checkDb
                        .selectFrom('users')
                        .select('address')
                        .where('username', '=', username)
                        .executeTakeFirst()
                    if (existingUser) throw new Error(`Username @${username} is already taken`)
                }

                const paymentId = keccak256(toHex(`mint:${userAddress}:${username}`))

                // ① Verify (no money moves — always safe to call)
                const { payer } = await verifyPayment({
                    paymentData, userAddress,
                    amountMicro,
                    description: `Mint username @${username}`,
                })

                // ② Try persist — duplicate insert means prior request exists
                let settleTxHash: string
                const pdBytes = paymentData
                    ? toBinary(PaymentDataSchema, paymentData) : null
                try {
                    await insertPayment({
                        id: paymentId,
                        payer_address: payer,
                        pay_to: addrs.DukerNews,
                        amount: Number(amountMicro),
                        token_address: tokenAddr,
                        chain_id: chainId,
                        evt_type: req.evtType,
                        action_params: JSON.stringify({ username, dukiBps }),
                        payment_scheme: PaymentScheme[paymentData?.scheme ?? 0] || 'mock',
                        payment_data: pdBytes,
                    })

                    // ③ Settle (money moves)
                    const settleResult = await settlePayment({
                        paymentData, userAddress, amountMicro,
                        settleTarget: 'contract',
                        description: `Mint username @${username}`,
                    })
                    settleTxHash = settleResult.settleTxHash
                    await updatePaymentStatus(paymentId, 'settled', { settle_tx_hash: settleTxHash })
                } catch (insertErr: any) {
                    // Duplicate — query existing payment and resume
                    const existing = await getPayment(paymentId)
                    if (!existing) throw insertErr // not a duplicate, re-throw
                    if (existing.status === 'executed') {
                        throw new Error(`Already completed (tx=${existing.exec_tx_hash}). Duplicate request.`)
                    }
                    if (existing.status === 'settled') {
                        console.log(`[handleTx] Resuming mint from settled: ${paymentId}`)
                        settleTxHash = existing.settle_tx_hash!
                    } else {
                        // verified but not settled — previous request still in progress
                        throw new Error('Payment in progress. Please wait.')
                    }
                }

                // ④ Execute contract
                const paymentNonce = keccak256(toHex(`x402:${userAddress}:${username}:${settleTxHash}`))
                try {
                    txHash = await walletClient.writeContract({
                        ...chainParam,
                        address: addrs.DukerNews,
                        abi: dukerNewsAbi,
                        functionName: 'mintUsernameViaX402',
                        args: [userAddress, username, amountMicro, BigInt(dukiBps), paymentNonce as `0x${string}`],
                    })
                    receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
                    await updatePaymentStatus(paymentId, 'executed', { exec_tx_hash: txHash })
                } catch (execErr: any) {
                    await incrementRetryCount(paymentId, execErr?.message || 'execute failed')
                    throw execErr
                }
                break
            }

            // ═══════════════════════════════════════════════════════════════════
            // PAID: POST_CREATED with boost
            // ═══════════════════════════════════════════════════════════════════
            case EventType.POST_CREATED: {
                const payload = req.data?.payload
                if (payload?.case !== 'postCreated') throw new Error('POST_CREATED: missing postCreated payload')
                const amountMicro = BigInt(payload.value.boostAmount)

                const paymentId = keccak256(toHex(`post:${userAddress}:${req.aggId}`))

                let settleTxHash: string | undefined

                if (amountMicro > 0n) {
                    // ① Verify (always safe)
                    const { payer } = await verifyPayment({
                        paymentData, userAddress, amountMicro,
                        description: 'DukerNews post boost',
                    })

                    // ② Try persist, catch duplicate
                    const pdBytes = paymentData
                        ? toBinary(PaymentDataSchema, paymentData) : null
                    try {
                        await insertPayment({
                            id: paymentId, payer_address: payer, pay_to: addrs.DukerNews,
                            amount: Number(amountMicro), token_address: tokenAddr,
                            chain_id: chainId, evt_type: req.evtType,
                            action_params: JSON.stringify({ aggId: req.aggId.toString() }),
                            payment_scheme: PaymentScheme[paymentData?.scheme ?? 0] || 'mock',
                            payment_data: pdBytes,
                        })

                        const settleResult = await settlePayment({
                            paymentData, userAddress, amountMicro,
                            settleTarget: 'user',
                            description: 'DukerNews post boost',
                        })
                        settleTxHash = settleResult.settleTxHash
                        await updatePaymentStatus(paymentId, 'settled', { settle_tx_hash: settleTxHash })
                    } catch (insertErr: any) {
                        const existing = await getPayment(paymentId)
                        if (!existing) throw insertErr
                        if (existing.status === 'executed') {
                            throw new Error(`Already completed (tx=${existing.exec_tx_hash}). Duplicate request.`)
                        }
                        if (existing.status === 'settled') {
                            console.log(`[handleTx] Resuming post from settled: ${paymentId}`)
                            settleTxHash = existing.settle_tx_hash!
                        } else {
                            throw new Error('Payment in progress. Please wait.')
                        }
                    }
                }

                const paymentNonce = keccak256(toHex(`x402-post:${userAddress}:${req.aggId}:${settleTxHash ?? '0x0'}`))
                try {
                    txHash = await walletClient.writeContract({
                        ...chainParam,
                        address: addrs.DukerNews,
                        abi: dukerNewsAbi,
                        functionName: 'submitPostViaX402',
                        args: [
                            userAddress, AGG_TYPE_POST, BigInt(req.aggId),
                            EVT_TYPE_POST_CREATED, eventDataHex as `0x${string}`,
                            amountMicro, paymentNonce as `0x${string}`,
                        ],
                    })
                    receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
                    if (amountMicro > 0n) await updatePaymentStatus(paymentId, 'executed', { exec_tx_hash: txHash })
                } catch (execErr: any) {
                    if (amountMicro > 0n) await incrementRetryCount(paymentId, execErr?.message || 'execute failed')
                    throw execErr
                }
                break
            }

            // ═══════════════════════════════════════════════════════════════════
            // PAID: BOOST_ATTENTION
            // ═══════════════════════════════════════════════════════════════════
            case EventType.BOOST_ATTENTION: {
                const p = req.data?.payload
                const boostMicro = p?.case === 'boostAttention' ? BigInt(p.value.boostAmount ?? 0) : 0n
                if (boostMicro <= 0n) throw new Error('Boost amount must be > 0')

                const paymentId = keccak256(toHex(`boost:${userAddress}:${req.aggType}:${req.aggId}:${boostMicro}`))

                // ① Verify (always safe)
                const { payer } = await verifyPayment({
                    paymentData, userAddress, amountMicro: boostMicro,
                    description: 'DukerNews boost attention',
                })

                // ② Try persist, catch duplicate
                let settleTxHash: string
                const pdBytes = paymentData
                    ? toBinary(PaymentDataSchema, paymentData) : null
                try {
                    await insertPayment({
                        id: paymentId, payer_address: payer, pay_to: addrs.DukerNews,
                        amount: Number(boostMicro), token_address: tokenAddr,
                        chain_id: chainId, evt_type: req.evtType,
                        action_params: JSON.stringify({ aggType: req.aggType, aggId: req.aggId.toString() }),
                        payment_scheme: PaymentScheme[paymentData?.scheme ?? 0] || 'mock',
                        payment_data: pdBytes,
                    })

                    const settleResult = await settlePayment({
                        paymentData, userAddress, amountMicro: boostMicro,
                        settleTarget: 'user',
                        description: 'DukerNews boost attention',
                    })
                    settleTxHash = settleResult.settleTxHash
                    await updatePaymentStatus(paymentId, 'settled', { settle_tx_hash: settleTxHash })
                } catch (insertErr: any) {
                    const existing = await getPayment(paymentId)
                    if (!existing) throw insertErr
                    if (existing.status === 'executed') {
                        throw new Error(`Already completed (tx=${existing.exec_tx_hash}). Duplicate request.`)
                    }
                    if (existing.status === 'settled') {
                        console.log(`[handleTx] Resuming boost from settled: ${paymentId}`)
                        settleTxHash = existing.settle_tx_hash!
                    } else {
                        throw new Error('Payment in progress. Please wait.')
                    }
                }

                const paymentNonce = keccak256(toHex(`x402-boost:${userAddress}:${settleTxHash}`))
                try {
                    txHash = await walletClient.writeContract({
                        ...chainParam,
                        address: addrs.DukerNews,
                        abi: dukerNewsAbi,
                        functionName: 'boostAttentionViaX402',
                        args: [
                            userAddress, req.aggType, BigInt(req.aggId), req.evtType,
                            eventDataHex as `0x${string}`, boostMicro, paymentNonce as `0x${string}`,
                        ],
                    })
                    receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
                    await updatePaymentStatus(paymentId, 'executed', { exec_tx_hash: txHash })
                } catch (execErr: any) {
                    await incrementRetryCount(paymentId, execErr?.message || 'execute failed')
                    throw execErr
                }
                break
            }

            // --- Reserved for future gasless-for-all support: ---
            // case EventType.COMMENT_CREATED:
            // case EventType.COMMENT_DELETED: {
            //     const paymentNonce = keccak256(toHex(`x402-comment:${userAddress}:${Date.now()}`))
            //     txHash = await walletClient.writeContract({
            //         ...chainParam,
            //         address: addrs.DukerNews,
            //         abi: dukerNewsAbi,
            //         functionName: 'submitCommentViaX402',
            //         args: [
            //             userAddress, req.aggType, BigInt(req.aggId), req.evtType,
            //             eventDataHex as `0x${string}`, 0n, paymentNonce as `0x${string}`,
            //         ],
            //     })
            //     receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
            //     break
            // }
            //
            // case EventType.COMMENT_AMEND: {
            //     const paymentNonce = keccak256(toHex(`x402-amend:${userAddress}:${Date.now()}`))
            //     txHash = await walletClient.writeContract({
            //         ...chainParam,
            //         address: addrs.DukerNews,
            //         abi: dukerNewsAbi,
            //         functionName: 'amendCommentViaX402',
            //         args: [
            //             userAddress, req.aggType, BigInt(req.aggId), req.evtType,
            //             eventDataHex as `0x${string}`, paymentNonce as `0x${string}`,
            //         ],
            //     })
            //     receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
            //     break
            // }
            //
            // case EventType.COMMENT_UPVOTED: {
            //     const paymentNonce = keccak256(toHex(`x402-upvote:${userAddress}:${Date.now()}`))
            //     txHash = await walletClient.writeContract({
            //         ...chainParam,
            //         address: addrs.DukerNews,
            //         abi: dukerNewsAbi,
            //         functionName: 'upvoteAttentionViaX402',
            //         args: [
            //             userAddress, req.aggType, BigInt(req.aggId), req.evtType,
            //             eventDataHex as `0x${string}`, paymentNonce as `0x${string}`,
            //         ],
            //     })
            //     receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
            //     break
            // }

            default:
                throw new Error(`Unsupported evt_type: ${req.evtType}`)
        }

        // Apply events from receipt logs
        let events: any[] = []
        try {
            if (receipt.status === 'reverted') throw new Error('Transaction reverted')
            const parsedLogs = parseEventLogs({ abi: dukerNewsAbi, logs: receipt.logs, eventName: 'DukerEvent' })
            events = await getEventsFromWebhookLogs(parsedLogs)
            if (events.length > 0) {
                await applyEvents(events)
            }
        } catch (e: any) {
            console.warn('[handleTx] applyEvents:', e?.message)
        }

        return create(PbDeltaEventsRespSchema, { events })
    } catch (err) {
        console.error('[handleTx] FATAL:', err)
        throw err
    }
}
