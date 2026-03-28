import type React from 'react'

interface BoostArrowProps {
    /** Total accumulated boost in micro-units (6 decimals, i.e. USDT × 1e6) */
    totalBoost: number | bigint
    voted: boolean
    isOwn: boolean
    onClick: () => void
    /** Show pulsing loading state while tx is processing */
    loading?: boolean
    ownSymbol?: string
    style?: React.CSSProperties
}

function fmtBoostLabel(usd: number): string {
    if (usd === 0) return '$0'
    if (usd < 1) return `$${usd.toFixed(2)}`
    if (usd < 1000) return `$${Math.round(usd)}`
    return `$${(usd / 1000).toFixed(1)}k`
}

/**
 * Styling only for the $X label, not the arrow.
 * Subtle tones — gold only comes in at higher boost levels.
 */
function labelStyle(usd: number, voted: boolean): React.CSSProperties {
    if (usd === 0 && !voted) {
        // $0 — barely visible
        return { color: 'var(--meta-color)', opacity: 0.35 }
    }
    if (voted || usd < 2) {
        // voted or tiny boost — just dim accent
        return { color: 'var(--meta-color)', opacity: 0.7 }
    }
    if (usd < 8) {
        // modest ($2–$8) — warm amber, muted
        return { color: '#c9963a', opacity: 0.85 }
    }
    if (usd < 20) {
        // healthy ($8–$20) — gold gradient on label only
        return {
            background: 'linear-gradient(180deg, #e6b84a 0%, #b8862a 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
        }
    }
    // hot ($20+) — richer gold, still not screaming
    return {
        background: 'linear-gradient(180deg, #f0c040 0%, #c07020 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
    }
}

export function BoostArrow({
    totalBoost,
    voted,
    isOwn,
    onClick,
    loading = false,
    ownSymbol = '*',
    style,
}: BoostArrowProps) {
    const usd = Number(totalBoost) / 1_000_000
    const label = fmtBoostLabel(usd)
    const arrowColor = voted ? 'var(--upvote-active)' : 'var(--meta-color)'
    const ls = labelStyle(usd, voted)

    if (isOwn) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', ...style }}>
                <span style={{ fontSize: '10px', color: 'var(--meta-color)', lineHeight: 1 }}>{ownSymbol}</span>
                <span style={{ fontSize: '7px', lineHeight: 1, fontVariantNumeric: 'tabular-nums', ...ls }}>{label}</span>
            </div>
        )
    }

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={voted || loading}
            title={loading ? 'Processing…' : voted ? `Upvoted · ${label} boosted` : usd > 0 ? `${label} boosted — click to upvote` : 'Upvote'}
            style={{
                background: 'none',
                border: 'none',
                cursor: loading ? 'wait' : voted ? 'default' : 'pointer',
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1px',
                ...style,
            }}
        >
            {/* ▲ or spinner */}
            {loading ? (
                <span style={{
                    display: 'inline-block',
                    width: '10px',
                    height: '10px',
                    border: '1.5px solid var(--border)',
                    borderTopColor: 'var(--duki-400)',
                    borderRadius: '50%',
                    animation: 'upvote-spin 0.6s linear infinite',
                }} />
            ) : (
                <span style={{ fontSize: '10px', lineHeight: 1, color: arrowColor }}>▲</span>
            )}
            {/* $X label — subtle gold only on the amount */}
            <span style={{ fontSize: '7px', lineHeight: 1, fontWeight: 600, fontVariantNumeric: 'tabular-nums', ...ls }}>
                {label}
            </span>
        </button>
    )
}
