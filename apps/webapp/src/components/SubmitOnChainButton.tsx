/**
 * SubmitOnChainButton — Shared on-chain submit button with three visual states:
 *
 *   1. Normal:     Purple button with label
 *   2. Processing: Purple button with spinning icon + step text (e.g. "confirming…")
 *   3. Success:    ✓ checkmark + success message
 *
 * Used by BoostPanel, comment/reply forms, and the /submit page.
 */
import type { DispatchStep } from '../client/useChainHandle'

/** Tiny CSS spinner — uses the `upvote-spin` keyframe from styles.css */
function Spinner({ size = 12 }: { size?: number }) {
    return (
        <span style={{
            display: 'inline-block',
            width: `${size}px`,
            height: `${size}px`,
            border: '1.5px solid rgba(255,255,255,0.3)',
            borderTopColor: 'var(--duki-100)',
            borderRadius: '50%',
            animation: 'upvote-spin 0.6s linear infinite',
            flexShrink: 0,
        }} />
    )
}

export interface SubmitOnChainButtonProps {
    /** Text label shown in the normal state */
    label: string
    /** Current dispatch step from useChainHandle */
    step: DispatchStep
    /** Message shown in the success state (default: "on-chain") */
    successMessage?: string
    /** Whether the button should be disabled beyond just pending state */
    disabled?: boolean
    /** Optional click handler for normal/processing state */
    onClick?: () => void
    /** Called when the user clicks the success-state button to dismiss */
    onDone?: () => void
    /** Button type — defaults to "button" */
    type?: 'button' | 'submit'
    /** Optional id for testing */
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

    // ── Render a single button for all states ──
    return (
        <button
            type={isDone ? 'button' : type}
            disabled={!isDone && (disabled || isPending)}
            onClick={isDone ? onDone : onClick}
            className="px-3 py-1 text-sm transition-all flex items-center gap-1.5"
            id={id}
            style={{
                background: isDone ? 'var(--duki-600)' : disabled ? 'var(--background)' : 'var(--duki-600)',
                color: isDone ? 'var(--duki-100)' : disabled ? 'var(--foreground)' : 'var(--duki-100)',
                border: '1px solid var(--border)',
                cursor: isPending ? 'wait' : isDone ? 'pointer' : disabled ? 'default' : 'pointer',
                borderRadius: 0,
                opacity: (!isDone && disabled) ? 0.4 : 1,
            }}
        >
            {isDone && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            )}
            {isPending && <Spinner size={12} />}
            {isDone ? successMessage : isPending ? `${step}…` : label}
        </button>
    )
}
