/**
 * useSubmitPost — Hook for submitting a post on-chain.
 *
 * Builds protobuf EventData, serializes to bytes, and submits via:
 *   - Direct: user calls contract, pays gas (checks USDT approve if amount > 0)
 *   - x402:  POST to /api/x402/submit-post, backend pays gas
 */
import { useState, useCallback } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount, usePublicClient } from 'wagmi'
import { create, toBinary } from '@bufbuild/protobuf'
import { toHex } from 'viem'
import {
    EventDataSchema,
    PostCreatedPayloadSchema,
    type PostKind,
} from '@repo/apidefs'
import type { PbPostData } from '@repo/apidefs'
import { dukerNewsAbi, ERC20_ABI, ADDRESSES, DEFAULT_CHAIN_ID, XLAYER_CHAIN_ID, getDefaultStablecoin, MIN_APPROVE_MICRO } from './contracts'
import { useOkxPaymentSigner } from './okx-payment-signer'

// Use real OKX gasless when: on XLayer production OR VITE_OKX_SETTLE=true (Sepolia/local testing)
const USE_OKX_SETTLE =
    DEFAULT_CHAIN_ID === XLAYER_CHAIN_ID ||
    (import.meta as any).env?.VITE_OKX_SETTLE === 'true'

// AggType.POST = 2 (matches proto AggType enum)
const AGG_TYPE_POST = 2
// EventType.POST_CREATED = 1 (matches proto EventType enum)
const EVT_TYPE_POST_CREATED = 1

export type SubmitMode = 'direct' | 'x402'

export interface SubmitPostInput {
    username: string
    title: string
    url?: string
    text?: string
    titleEn?: string
    urlEn?: string
    textEn?: string
    kind: PostKind
    locale: string
    domain?: string
    postData?: PbPostData
    amount?: number          // marketing boost amount (USDT, human-readable)
}

/** Serialize the EventData protobuf to hex bytes */
function buildEventDataHex(input: SubmitPostInput): `0x${string}` {
    const payload = create(PostCreatedPayloadSchema, {
        title: input.title,
        url: input.url ?? '',
        text: input.text ?? '',
        titleEn: input.titleEn ?? '',
        urlEn: input.urlEn ?? '',
        textEn: input.textEn ?? '',
        kind: input.kind,
        locale: input.locale,
        domain: input.domain ?? '',
        postData: input.postData,
    })

    const eventData = create(EventDataSchema, {
        payload: {
            case: 'postCreated',
            value: payload,
        },
    })

    const bytes = toBinary(EventDataSchema, eventData)
    return toHex(bytes)
}

export function useSubmitPost() {
    const [isPending, setIsPending] = useState(false)
    const [error, setError] = useState<Error | null>(null)
    const [txHash, setTxHash] = useState<`0x${string}` | undefined>()

    const { address } = useAccount()
    const publicClient = usePublicClient()
    const { writeContractAsync } = useWriteContract()
    const { signPayment } = useOkxPaymentSigner()

    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
        hash: txHash,
    })

    /** Notify backend about the txHash (fire-and-forget) */
    const notifyBackend = (hash: string) => {
        fetch('/api/notify-tx', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ txHash: hash }),
        }).catch(() => {/* silent — indexing is best-effort */})
    }

    /** Direct path: user calls contract, pays gas. Handles USDT approve if needed. */
    const submitDirect = useCallback(async (input: SubmitPostInput) => {
        setError(null)
        setIsPending(true)

        try {
            const hexData = buildEventDataHex(input)

            const contractAddress = ADDRESSES[DEFAULT_CHAIN_ID]?.DukerNews
            if (!contractAddress) throw new Error('DukerNews address not configured')

            const stablecoin = getDefaultStablecoin(DEFAULT_CHAIN_ID)
            const amountMicro = BigInt(Math.round((input.amount ?? 0) * 10 ** stablecoin.decimals))

            // Check + approve stablecoin allowance if marketing boost > 0
            if (amountMicro > 0n && address && publicClient) {
                const stablecoinAddress = stablecoin.address
                if (!stablecoinAddress) throw new Error('Stablecoin address not configured')

                const allowance = await publicClient.readContract({
                    address: stablecoinAddress,
                    abi: ERC20_ABI,
                    functionName: 'allowance',
                    args: [address, contractAddress],
                }) as bigint

                if (allowance < amountMicro) {
                    // Approve the contract to spend stablecoin
                    const approveTx = await writeContractAsync({
                        address: stablecoinAddress,
                        abi: ERC20_ABI,
                        functionName: 'approve',
                        args: [contractAddress, amountMicro > MIN_APPROVE_MICRO ? amountMicro : MIN_APPROVE_MICRO],
                    })
                    // Wait for approve to be mined before submitting
                    await publicClient.waitForTransactionReceipt({ hash: approveTx })
                }
            }

            const hash = await writeContractAsync({
                address: contractAddress,
                abi: dukerNewsAbi,
                functionName: 'submitPost',
                args: [
                    AGG_TYPE_POST,
                    BigInt(0),            // aggId = 0 → create new
                    EVT_TYPE_POST_CREATED,
                    hexData,
                    amountMicro,          // USDT amount (6 decimals)
                ],
            })

            setTxHash(hash)
            notifyBackend(hash)
            return hash
        } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err))
            setError(e)
            throw e
        } finally {
            setIsPending(false)
        }
    }, [writeContractAsync, address, publicClient])

    /** X402 path: backend settles payment via OKX, calls contract as operator. */
    const submitViaX402 = useCallback(async (input: SubmitPostInput) => {
        setError(null)
        setIsPending(true)

        try {
            const hexData = buildEventDataHex(input)
            const contractAddress = ADDRESSES[DEFAULT_CHAIN_ID]?.DukerNews
            if (!contractAddress) throw new Error('DukerNews address not configured')

            const amountMicro = BigInt(Math.round((input.amount ?? 0) * 1_000_000))

            // Sign EIP-3009 when: on XLayer, OR VITE_OKX_SETTLE=true (Sepolia testing).
            // On plain dev (no env flag) the server falls back to mock mint.
            let paymentPayload: any = undefined
            if (USE_OKX_SETTLE && amountMicro > 0n) {
                paymentPayload = await signPayment({
                    amountMicro,
                    payTo: contractAddress as `0x${string}`,
                })
            }

            const resp = await fetch('/api/x402/submit-post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventDataHex: hexData,
                    amount: input.amount ?? 0,
                    paymentPayload,   // undefined on dev → server uses mock mint
                }),
            })

            const data = await resp.json() as { success: boolean; message?: string; txHash?: string }
            if (!data.success) {
                throw new Error(data.message || 'x402 submit failed')
            }

            const hash = data.txHash as `0x${string}`
            setTxHash(hash)
            notifyBackend(hash)
            return hash
        } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err))
            setError(e)
            throw e
        } finally {
            setIsPending(false)
        }
    }, [signPayment])

    return {
        submitDirect,
        submitViaX402,
        isPending,
        isConfirming,
        isConfirmed,
        txHash,
        error,
    }
}
