/**
 * BoostPanel — Shared inline boost widget used by PostDetail and CommentItem.
 *
 * Renders a bordered container with DukiPayment + action row (boost / cancel / status).
 * Caller provides aggType/aggId, onBoost callback, and onCancel.
 */

import { useState } from 'react'
import { create } from '@bufbuild/protobuf'
import {
    EventType, AggType,
    DukerTxReqSchema, EventDataSchema, BoostAttentionPayloadSchema,
} from '@repo/apidefs'
import { DukiPayment, type DukiPaymentValue } from './DukiPayment'
import { useChainHandle } from '../client/useChainHandle'
import { useAuthStore } from '../lib/authStore'
import { SubmitOnChainButton } from './SubmitOnChainButton'

export interface BoostPanelProps {
    aggType: AggType
    aggId: bigint
    /** Preset amounts in USD, e.g. [1, 2, 8, 20] */
    amounts?: number[]
    defaultAmount?: number
    subLabel?: string
    /** Called after successful boost with the amount in micro-units (6 decimals) */
    onSuccess?: (boostMicroUnits: number) => void
    onCancel: () => void
}

export function BoostPanel({
    aggType,
    aggId,
    amounts = [1, 2, 8, 20],
    defaultAmount = 1,
    subLabel = 'boost with USDT',
    onSuccess,
    onCancel,
}: BoostPanelProps) {
    const { me } = useAuthStore()
    const { dispatch, step, error: chainError, reset } = useChainHandle()
    const cmdPending = step !== 'idle' && step !== 'done'
    const isDone = step === 'done'

    const [boostAmount, setBoostAmount] = useState(defaultAmount)
    const [boostMethod, setBoostMethod] = useState<string>('direct')
    const [paymentChainId, setPaymentChainId] = useState('')
    const [paymentStablecoin, setPaymentStablecoin] = useState('')

    const handleBoost = async () => {
        if (!me?.ego || boostAmount <= 0 || cmdPending || isDone) return
        const microUnits = Math.round(boostAmount * 1_000_000)
        try {
            const txData = create(DukerTxReqSchema, {
                address: me.ego,
                aggType,
                aggId,
                evtType: EventType.BOOST_ATTENTION,
                paymentChain: paymentChainId,
                paymentStablecoinAddress: paymentStablecoin,
                data: create(EventDataSchema, {
                    payload: {
                        case: 'boostAttention',
                        value: create(BoostAttentionPayloadSchema, {
                            boostAmount: BigInt(microUnits),
                        }),
                    },
                }),
            })
            await dispatch(txData, boostMethod === 'x402')
            // Notify parent to update totalBoost immediately
            onSuccess?.(microUnits)
        } catch {
            // Error shown via chainError
        }
    }

    return (
        <div id="boost-panel" className="rounded border overflow-hidden" style={{ borderColor: 'var(--border)', marginTop: '6px', maxWidth: '380px' }}>
            {/* Payment widget */}
            <div className="p-3">
                <DukiPayment
                    dukiBps={me?.dukiBps ?? 5000}
                    amounts={amounts}
                    defaultAmount={defaultAmount}
                    defaultMethod="direct"
                    amountLabel="Boost amount"
                    amountSubLabel={subLabel}
                    onChange={(v: DukiPaymentValue) => {
                        setBoostAmount(v.amount)
                        setBoostMethod(v.method)
                        setPaymentChainId(String(v.chainId))
                        setPaymentStablecoin(v.stablecoinAddress)
                    }}
                    disabled={cmdPending || isDone}
                />
            </div>

            {/* Action row */}
            <div
                className="flex items-center gap-2 px-3 py-2 border-t"
                style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}
            >
                <SubmitOnChainButton
                    label={`boost $${boostAmount}`}
                    step={step}
                    successMessage={`Boosted $${boostAmount} on-chain`}
                    disabled={boostAmount <= 0}
                    onClick={handleBoost}
                    onDone={() => { reset(); onCancel() }}
                    id="boost-confirm"
                />
                {!isDone && (
                    <button
                        type="button"
                        onClick={() => { reset(); onCancel() }}
                        disabled={cmdPending}
                        className="text-xs"
                        id="boost-cancel"
                        style={{ background: 'none', border: 'none', cursor: cmdPending ? 'default' : 'pointer', color: 'var(--meta-color)', opacity: cmdPending ? 0.4 : 1 }}
                    >
                        cancel
                    </button>
                )}
                {isDone && (
                    <button
                        type="button"
                        onClick={() => { reset(); onCancel() }}
                        className="text-xs"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--meta-color)' }}
                    >
                        close
                    </button>
                )}
                {chainError && (
                    <span className="text-xs" style={{ color: 'var(--destructive, #e55)' }}>{chainError}</span>
                )}
            </div>
        </div>
    )
}
