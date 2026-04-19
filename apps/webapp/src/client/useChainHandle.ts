/**
 * useChainHandle — On-chain command dispatcher hook.
 *
 * dispatch(txData, gasless):
 *   - gasless=true  → sign payment (EIP-3009 or EIP-2612) + ConnectRPC TxService.TxHandle (gasless)
 *   - gasless=false → directHandle (user pays gas) + TxService.NotifyTx
 *
 * Both paths return PbDeltaEventsResp.events for client-side applyEvents.
 */

import { useState, useCallback } from 'react'
import { useWriteContract, usePublicClient, useAccount, useWalletClient } from 'wagmi'
import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import {
    TxService, EventType,
    type DukerTxReq, type PbEvent,
} from '@repo/apidefs'
import { refreshAuth } from './auth-api'
import type { AuthRefreshResult } from './auth-api'
import { directHandle } from './directHandle'
import type { DirectHandleResult } from './directHandle'
import { getDefaultStablecoin, ADDRESSES, DEFAULT_CHAIN_ID } from '../lib/contracts'
import { signPayment } from './signPayment'
import { notifyRegistryWorker } from './registry-api'

// ConnectRPC client for x402 + notifyTx
const cmdTransport = createConnectTransport({ baseUrl: '/rpc' })
const txClient = createClient(TxService, cmdTransport)

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
/**
 * Extract a human-readable revert reason from a viem/wagmi error.
 *
 * With simulateContract() as a pre-check, viem decodes custom errors
 * using the contract ABI (e.g. "NameTaken", "InvalidName").
 * Without simulation, wallet errors are generic ("gas limit too high").
 */
function extractRevertReason(e: any): string {
    // User rejected in wallet
    if (e?.code === 4001 || e?.message?.includes('User rejected') || e?.message?.includes('user rejected')) {
        return 'Transaction rejected by user'
    }

    // viem decoded error — best source (from simulateContract)
    if (typeof e?.walk === 'function') {
        const revertErr = e.walk((err: any) => err?.name === 'ContractFunctionRevertedError')
        if (revertErr?.data?.errorName) {
            const args = revertErr.data.args?.length ? `: ${revertErr.data.args.join(', ')}` : ''
            return `${revertErr.data.errorName}${args}`
        }
        if (revertErr?.reason) return revertErr.reason
    }

    // shortMessage — filter out misleading gas errors
    const short = e?.shortMessage || ''
    if (short && !/gas limit|gas required/i.test(short)) {
        return short.replace(/reverted with the following reason:\s*$/m, 'reverted').trim() || short
    }

    return e?.message?.split('\n')[0] || 'Transaction failed'
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

    const dispatch = useCallback(async (txData: DukerTxReq, gasless: boolean): Promise<DispatchResult> => {
        setError('')
        setTxHash('')

        try {
            // ─── gasless (via ConnectRPC) ─────────────────
            if (gasless) {
                // Ensure address is set from connected wallet
                if (!txData.address && address) {
                    txData.address = address.toLowerCase()
                }
                const paymentAmount = getPaymentAmount(txData)

                // If payment is needed, sign EIP-2612 permit for stablecoin approval
                if (paymentAmount > 0n && walletClient && address) {
                    setStep('signing')

                    const stablecoin = getDefaultStablecoin(DEFAULT_CHAIN_ID)
                    txData.paymentData = await signPayment({
                        walletClient,
                        publicClient: publicClient!,
                        address: address as `0x${string}`,
                        tokenName: stablecoin.name,
                        tokenAddress: stablecoin.address,
                        payTo: ADDRESSES[DEFAULT_CHAIN_ID].DukerNews,
                        amount: paymentAmount,
                        chainId: DEFAULT_CHAIN_ID,
                    })
                }

                setStep('executing')
                const resp = await txClient.txHandle(txData)

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
                simulateContract: (args) => publicClient!.simulateContract(args),
                waitForReceipt: async (hash) => {
                    const receipt = await publicClient!.waitForTransactionReceipt({ hash })
                    if (receipt.status === 'reverted') throw new Error('Transaction reverted')
                },
                readContract: (args) => publicClient!.readContract(args),
                onStep: setStep,
            })

            setTxHash(result.txHash)

            // Server confirms tx + applies events via ConnectRPC (returns PbEvent[])
            setStep('confirming')
            let events: PbEvent[] = []
            try {
                await new Promise(r => setTimeout(r, 1000))
                const resp = await txClient.notifyTx({ txHash: result.txHash })
                events = resp.events
            } catch { /* best-effort — webhook will catch up */ }

            // Fire-and-forget: sync to registry worker API
            if (txData.evtType === EventType.USER_MINTED) {
                notifyRegistryWorker(result.txHash, DEFAULT_CHAIN_ID).catch(() => {})
            }

            // If USER_MINTED, also refresh auth to get JWT cookie
            if (txData.evtType === EventType.USER_MINTED) {
                const dukiBps = txData.data?.payload?.case === 'userMinted'
                    ? txData.data.payload.value.dukiBps : 0
                let authResult: AuthRefreshResult | undefined
                try { authResult = await refreshAuth(dukiBps) } catch { /* best-effort */ }
                setStep('done')
                return { ...result, events, authResult }
            }

            setStep('done')
            return { ...result, events }
        } catch (e: any) {
            const msg = extractRevertReason(e)
            setError(msg)
            setStep('idle')
            throw e
        }
    }, [address, publicClient, writeContractAsync, walletClient])

    return { dispatch, step, txHash, error, reset }
}
