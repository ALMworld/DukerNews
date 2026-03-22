/**
 * TextField — Pre-bound text input field for TanStack Form.
 * Uses useFieldContext so it auto-binds to the form field.
 */
import { useFieldContext } from '../form-context'

const inputCls =
    'w-full rounded border border-[color:var(--border)] text-sm px-2 py-1.5 outline-none transition-colors focus:border-[color:var(--duki-500)]'
const inputStyle: React.CSSProperties = {
    background: 'var(--input)',
    color: 'var(--foreground)',
}

export function TextField({
    label,
    hint,
    tooltip,
    placeholder,
    required,
    type = 'text',
    style,
}: {
    label: string
    hint?: string
    tooltip?: string
    placeholder?: string
    required?: boolean
    type?: 'text' | 'url' | 'number'
    style?: React.CSSProperties
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
            <input
                type={type}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder={placeholder}
                required={required}
                className={inputCls}
                style={{ ...inputStyle, ...style }}
            />
        </div>
    )
}
