/**
 * useChainHandle — On-chain command dispatcher hook.
 *
 * dispatch(txData, x402):
 *   - x402=true  → sign EIP-2612 permit (if payment needed) + ConnectRPC CmdService.X402Handle (gasless)
 *   - x402=false → directHandle (user pays gas) + CmdService.NotifyTx
 *
 * Both paths return PbDeltaEventsResp.events for client-side applyEvents.
 */

import { useState, useCallback } from 'react'
import { useWriteContract, usePublicClient, useAccount, useWalletClient } from 'wagmi'
import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import {
    CmdService, EventType,
    type DukerTxReq, type PbEvent,
    PaymentPayloadSchema,
} from '@repo/apidefs'
import { create } from '@bufbuild/protobuf'
import { refreshAuth } from './auth-api'
import type { AuthRefreshResult } from './auth-api'
import { directHandle } from './directHandle'
import type { DirectHandleResult } from './directHandle'
import { getDefaultStablecoin, ADDRESSES, DEFAULT_CHAIN_ID } from '../lib/contracts'

// ConnectRPC client for x402 + notifyTx
const cmdTransport = createConnectTransport({ baseUrl: '/rpc' })
const cmdClient = createClient(CmdService, cmdTransport)

// ─── Types ──────────────────────────────────────────────────

export type DispatchStep = 'idle' | 'approving' | 'signing' | 'executing' | 'confirming' | 'indexing' | 'done'

export interface DispatchResult extends Partial<DirectHandleResult> {
    authResult?: AuthRefreshResult
    /** Enriched events from server for client-side applyCommentEvents/applyPostEvents */
    events?: PbEvent[]
}

// ─── Helpers ────────────────────────────────────────────────

/** Extract how much USDT this x402 request needs (0 = free operation) */
function getPaymentAmount(txData: DukerTxReq): bigint {
    const p = txData.data?.payload
    if (!p) return 0n
    switch (p.case) {
        case 'userMinted': return BigInt(p.value.mintAmount || 0)
        case 'postCreated': return BigInt(p.value.boostAmount || 0)
        case 'boostAttention': return BigInt(p.value.boostAmount || 0)
        default: return 0n
    }
}

// ─── Hook ───────────────────────────────────────────────────

export function useChainHandle() {
    const [step, setStep] = useState<DispatchStep>('idle')
    const [txHash, setTxHash] = useState<string>('')
    const [error, setError] = useState<string>('')

    const { address } = useAccount()
    const publicClient = usePublicClient()
    const { writeContractAsync } = useWriteContract()
    const { data: walletClient } = useWalletClient()

    const reset = useCallback(() => {
        setStep('idle')
        setTxHash('')
        setError('')
    }, [])

    const dispatch = useCallback(async (txData: DukerTxReq, x402: boolean): Promise<DispatchResult> => {
        setError('')
        setTxHash('')

        try {
            // ─── x402 (gasless via ConnectRPC) ─────────────
            if (x402) {
                // Ensure address is set from connected wallet
                if (!txData.address && address) {
                    txData.address = address.toLowerCase()
                }
                const paymentAmount = getPaymentAmount(txData)

                // If payment is needed, sign EIP-2612 permit for stablecoin approval
                if (paymentAmount > 0n && walletClient && address) {
                    setStep('signing')

                    const stablecoin = getDefaultStablecoin(DEFAULT_CHAIN_ID)
                    const dukerNews = ADDRESSES[DEFAULT_CHAIN_ID].DukerNews
                    const chainId = DEFAULT_CHAIN_ID

                    // Read nonce from stablecoin contract
                    const nonce = await publicClient!.readContract({
                        address: stablecoin.address,
                        abi: [{
                            type: 'function', name: 'nonces',
                            inputs: [{ name: 'owner', type: 'address' }],
                            outputs: [{ name: '', type: 'uint256' }],
                            stateMutability: 'view',
                        }] as const,
                        functionName: 'nonces',
                        args: [address as `0x${string}`],
                    })

                    // Deadline: 1 hour from now
                    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)

                    // Sign EIP-2612 permit typed data
                    const signature = await walletClient.signTypedData({
                        account: address as `0x${string}`,
                        domain: {
                            name: stablecoin.name, // must match ERC20Permit constructor
                            version: '1',
                            chainId: BigInt(chainId),
                            verifyingContract: stablecoin.address,
                        },
                        types: {
                            Permit: [
                                { name: 'owner', type: 'address' },
                                { name: 'spender', type: 'address' },
                                { name: 'value', type: 'uint256' },
                                { name: 'nonce', type: 'uint256' },
                                { name: 'deadline', type: 'uint256' },
                            ],
                        },
                        primaryType: 'Permit',
                        message: {
                            owner: address as `0x${string}`,
                            spender: dukerNews,
                            value: paymentAmount,
                            nonce,
                            deadline,
                        },
                    })

                    // Parse signature into r, s, v and pack as 65-byte Uint8Array
                    const sigHex = signature.slice(2) // remove 0x
                    const sigBytes = new Uint8Array(65)
                    for (let i = 0; i < 64; i++) {
                        sigBytes[i] = parseInt(sigHex.slice(i * 2, i * 2 + 2), 16)
                    }
                    sigBytes[64] = parseInt(sigHex.slice(128, 130), 16)

                    // Attach permit to txData
                    txData.paymentPayload = create(PaymentPayloadSchema, {
                        deadline,
                        signature: sigBytes,
                        value: paymentAmount.toString(),
                    })
                }

                setStep('executing')
                const resp = await cmdClient.x402Handle(txData)

                if (txData.evtType === EventType.USER_MINTED) {
                    setStep('confirming')
                    const dukiBps = txData.data?.payload?.case === 'userMinted'
                        ? txData.data.payload.value.dukiBps : 0
                    let authResult: AuthRefreshResult | undefined
                    try { authResult = await refreshAuth(dukiBps) } catch { /* best-effort */ }
                    setStep('done')
                    return { authResult, events: resp.events }
                }

                setStep('done')
                return { events: resp.events }
            }

            // ─── direct (user pays gas) ────────────────────
            if (!address) throw new Error('Wallet not connected')

            const result = await directHandle(txData, {
                address: address as `0x${string}`,
                writeContractAsync,
                waitForReceipt: (hash) => publicClient!.waitForTransactionReceipt({ hash }).then(() => { }),
                readContract: (args) => publicClient!.readContract(args),
                onStep: setStep,
            })

            setTxHash(result.txHash)

            // Notify backend via RPC — returns enriched events
            setStep('indexing')
            let events: PbEvent[] = []
            try {
                const resp = await cmdClient.notifyTx({ txHash: result.txHash })
                events = resp.events
            } catch {
                // Best-effort — indexing may still happen via polling
            }

            setStep('done')
            return { ...result, events }
        } catch (e: any) {
            const msg = e?.shortMessage || e?.message || 'Command failed'
            setError(msg)
            setStep('idle')
            throw e
        }
    }, [address, publicClient, writeContractAsync, walletClient])

    return { dispatch, step, txHash, error, reset }
}
