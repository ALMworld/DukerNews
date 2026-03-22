/**
 * AmountSelect — Theme-aware marketing-pay amount selector.
 *
 * Preset chip buttons + "Other" custom input.
 * Uses DukerNews CSS variables (--duki-*, --border, --muted, --meta-color).
 */
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface AmountSelectProps {
    amounts?: number[]
    onSelect: (amount: number) => void
    currency?: string
    defaultAmount?: number
    disabled?: boolean
}

export function AmountSelect({
    amounts = [0, 1, 2, 3],
    onSelect,
    currency = 'USDT',
    defaultAmount,
    disabled = false,
}: AmountSelectProps) {
    const [selectedAmount, setSelectedAmount] = useState<number | null>(
        typeof defaultAmount === 'number' ? defaultAmount : 0
    )
    const [isCustom, setIsCustom] = useState(false)
    const [customValue, setCustomValue] = useState('')

    useEffect(() => {
        if (typeof defaultAmount === 'number') {
            onSelect(defaultAmount)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleSelect = (amount: number) => {
        if (disabled) return
        setSelectedAmount(amount)
        setIsCustom(false)
        onSelect(amount)
    }

    const handleCustomToggle = () => {
        if (disabled) return
        setIsCustom(true)
        setSelectedAmount(null)
    }

    const handleCustomChange = (value: string) => {
        if (disabled) return
        setCustomValue(value)
        const numValue = parseFloat(value)
        if (!isNaN(numValue) && numValue >= 0) {
            onSelect(numValue)
        }
    }

    return (
        <div className="space-y-2">
            <label
                className="mb-0.5 block text-xs font-medium"
                style={{ color: 'var(--meta-color)' }}
            >
                Marketing Boost ({currency})
                <span className="ml-1 text-[10px] opacity-60">
                    — pay the world to pay attention
                </span>
            </label>

            <div className="flex flex-wrap gap-1.5">
                {amounts.map((amount) => {
                    const on = selectedAmount === amount && !isCustom
                    return (
                        <button
                            key={amount}
                            type="button"
                            onClick={() => handleSelect(amount)}
                            disabled={disabled}
                            className={cn(
                                'rounded border px-2.5 py-1 text-xs font-medium transition-all duration-200',
                                on
                                    ? 'border-[color:var(--duki-500)] bg-[color:var(--duki-500)]/10 shadow-sm'
                                    : 'border-[color:var(--border)] bg-[color:var(--muted)] hover:bg-[color:var(--muted)]/80',
                                disabled && 'opacity-50 cursor-not-allowed'
                            )}
                            style={{
                                color: on ? 'var(--foreground)' : 'var(--meta-color)',
                                ...(on ? { boxShadow: '0 0 8px var(--duki-500-alpha, rgba(168,85,247,.15))' } : {}),
                            }}
                        >
                            {amount === 0 ? 'Free' : `$${amount}`}
                        </button>
                    )
                })}
                <button
                    type="button"
                    onClick={handleCustomToggle}
                    disabled={disabled}
                    className={cn(
                        'rounded border px-2.5 py-1 text-xs font-medium transition-all duration-200',
                        isCustom
                            ? 'border-[color:var(--duki-500)] bg-[color:var(--duki-500)]/10 shadow-sm'
                            : 'border-[color:var(--border)] bg-[color:var(--muted)] hover:bg-[color:var(--muted)]/80',
                        disabled && 'opacity-50 cursor-not-allowed'
                    )}
                    style={{
                        color: isCustom ? 'var(--foreground)' : 'var(--meta-color)',
                        ...(isCustom ? { boxShadow: '0 0 8px var(--duki-500-alpha, rgba(168,85,247,.15))' } : {}),
                    }}
                >
                    Other
                </button>
            </div>

            {isCustom && (
                <input
                    type="number"
                    value={customValue}
                    onChange={(e) => handleCustomChange(e.target.value)}
                    min={0}
                    step={0.5}
                    disabled={disabled}
                    placeholder="Custom amount"
                    className="rounded border border-[color:var(--border)] text-sm px-2 py-1.5 outline-none transition-colors focus:border-[color:var(--duki-500)] w-32"
                    style={{
                        background: 'var(--input)',
                        color: 'var(--foreground)',
                    }}
                />
            )}
        </div>
    )
}
