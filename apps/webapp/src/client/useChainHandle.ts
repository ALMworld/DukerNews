/**
 * useChainHandle — On-chain command dispatcher hook.
 *
 * dispatch(txData, x402):
 *   - x402=true  → ConnectRPC CmdService.X402Handle (gasless)
 *   - x402=false → directHandle (user pays gas) + CmdService.NotifyTx
 *
 * Both paths return PbDeltaEventsResp.events for client-side applyEvents.
 */

import { useState, useCallback } from 'react'
import { useWriteContract, usePublicClient, useAccount } from 'wagmi'
import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { CmdService, EventType, type DukerTxReq, type PbEvent } from '@repo/apidefs'
import { refreshAuth } from './auth-api'
import type { AuthRefreshResult } from './auth-api'
import { directHandle } from './directHandle'
import type { DirectHandleResult } from './directHandle'

// ConnectRPC client for x402 + notifyTx
const cmdTransport = createConnectTransport({ baseUrl: '/rpc' })
const cmdClient = createClient(CmdService, cmdTransport)

// ─── Types ──────────────────────────────────────────────────

export type DispatchStep = 'idle' | 'approving' | 'executing' | 'confirming' | 'indexing' | 'done'

export interface DispatchResult extends Partial<DirectHandleResult> {
    authResult?: AuthRefreshResult
    /** Enriched events from server for client-side applyCommentEvents/applyPostEvents */
    events?: PbEvent[]
}

// ─── Hook ───────────────────────────────────────────────────

export function useChainHandle() {
    const [step, setStep] = useState<DispatchStep>('idle')
    const [txHash, setTxHash] = useState<string>('')
    const [error, setError] = useState<string>('')

    const { address } = useAccount()
    const publicClient = usePublicClient()
    const { writeContractAsync } = useWriteContract()

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
    }, [address, publicClient, writeContractAsync])

    return { dispatch, step, txHash, error, reset }
}
