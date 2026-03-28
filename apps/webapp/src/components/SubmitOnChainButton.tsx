/**
 * SubmitOnChainButton — Shared on-chain submit button with three visual states:
 *
 *   1. Normal:     Purple button with label
 *   2. Processing: Purple button with spinning icon + step text (e.g. "Confirming…")
 *   3. Success:    ✓ checkmark + success message
 *
 * Used by BoostPanel, comment/reply forms, and the /submit page.
 */
import { Check, Loader2 } from 'lucide-react'
import type { DispatchStep } from '../client/useChainHandle'

export interface SubmitOnChainButtonProps {
    label: string
    step: DispatchStep
    successMessage?: string
    disabled?: boolean
    onClick?: () => void
    onDone?: () => void
    type?: 'button' | 'submit'
    id?: string
}

export function SubmitOnChainButton({
    label,
    step,
    successMessage = 'on-chain',
    disabled = false,
    onClick,
    onDone,
    type = 'button',
    id,
}: SubmitOnChainButtonProps) {
    const isPending = step !== 'idle' && step !== 'done'
    const isDone = step === 'done'

    const base = 'px-3 py-1.5 text-sm border border-[var(--border)] rounded-none transition-all whitespace-nowrap'
    const stateClass = isDone
        ? 'bg-[var(--duki-600)] text-[var(--duki-100)] cursor-pointer'
        : isPending
            ? 'bg-[var(--duki-600)] text-[var(--duki-100)] cursor-wait'
            : disabled
                ? 'bg-[var(--background)] text-[var(--foreground)] opacity-40 cursor-default'
                : 'bg-[var(--duki-600)] text-[var(--duki-100)] cursor-pointer'

    const stepText = isPending
        ? `${step.charAt(0).toUpperCase() + step.slice(1)}…`
        : isDone
            ? successMessage
            : label

    return (
        <button
            type={isDone ? 'button' : type}
            disabled={!isDone && (disabled || isPending)}
            onClick={isDone ? onDone : onClick}
            className={`${base} ${stateClass}`}
            id={id}
        >
            {isDone && <Check className="inline-block align-middle mr-1.5 size-4" />}
            {isPending && <Loader2 className="inline-block align-middle mr-1.5 size-4 animate-spin" />}
            <span className="align-middle">{stepText}</span>
        </button>
    )
}
