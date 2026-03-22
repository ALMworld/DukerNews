/**
 * TextAreaField — Pre-bound textarea field for TanStack Form.
 */
import { useFieldContext } from '../form-context'
import { cn } from '@/lib/utils'

const inputCls =
    'w-full rounded border border-[color:var(--border)] text-sm px-2 py-1.5 outline-none transition-colors focus:border-[color:var(--duki-500)]'
const inputStyle: React.CSSProperties = {
    background: 'var(--input)',
    color: 'var(--foreground)',
}

export function TextAreaField({
    label,
    hint,
    tooltip,
    placeholder,
    rows = 3,
}: {
    label: string
    hint?: string
    tooltip?: string
    placeholder?: string
    rows?: number
}) {
    const field = useFieldContext<string>()
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
            <textarea
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder={placeholder}
                rows={rows}
                className={cn(inputCls, 'resize-y')}
                style={inputStyle}
            />
        </div>
    )
}
