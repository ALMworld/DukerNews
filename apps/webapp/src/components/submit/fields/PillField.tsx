/**
 * PillField — Pre-bound pill selector field for TanStack Form.
 *
 * Renders a row of small selectable pill buttons.
 * Works with any string | number value type (enums, etc).
 */
import { useFieldContext } from '../form-context'
import { cn } from '@/lib/utils'

export interface PillOption<T> {
    value: T
    label: React.ReactNode
    tooltip?: string
}

export function PillField<T extends string | number>({
    label,
    hint,
    tooltip,
    options,
}: {
    label: string
    hint?: string
    tooltip?: string
    options: PillOption<T>[]
}) {
    const field = useFieldContext<T>()
    return (
        <div title={tooltip}>
            <label className="mb-0.5 block text-xs" style={{ color: 'var(--meta-color)' }}>
                <span className="font-medium">{label}</span>
                {hint && (
                    <span className="ml-1 font-normal" style={{ color: 'var(--duki-500)' }}>
                        {hint}
                    </span>
                )}
            </label>
            <div className="flex flex-wrap gap-1">
                {options.map((opt) => {
                    const on = field.state.value === opt.value
                    return (
                        <button
                            key={String(opt.value)}
                            type="button"
                            title={opt.tooltip}
                            onClick={() => field.handleChange(opt.value as any)}
                            className={cn(
                                'rounded border px-2 py-0.5 text-xs font-medium transition-colors',
                                on
                                    ? 'border-[color:var(--duki-500)] bg-[color:var(--duki-500)]/10'
                                    : 'border-[color:var(--border)] hover:bg-[color:var(--muted)]/50'
                            )}
                            style={{ color: on ? 'var(--foreground)' : 'var(--meta-color)' }}
                        >
                            {opt.label}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
