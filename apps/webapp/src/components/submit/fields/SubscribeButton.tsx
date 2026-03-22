/**
 * SubscribeButton — Pre-bound submit button for TanStack Form.
 * Auto-disables when submitting or when canSubmit is false.
 */
import { useFormContext } from '../form-context'

export function SubscribeButton({ label = 'Submit' }: { label?: string }) {
    const form = useFormContext()
    return (
        <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded px-4 py-1.5 text-sm font-bold text-white transition-opacity hover:opacity-90 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
                    style={{ background: 'var(--duki-500)' }}
                >
                    {isSubmitting ? 'Submitting…' : label}
                </button>
            )}
        </form.Subscribe>
    )
}
