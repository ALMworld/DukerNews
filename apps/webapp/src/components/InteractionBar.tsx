/**
 * InteractionBar — reply + boost action row.
 *
 * `activeAction` controls both highlight and the secondary visibility rule:
 *   'reply'  → reply highlighted, boost shown unhighlighted
 *   'boost'  → boost highlighted, reply shown unhighlighted
 *   'none'   → both shown unhighlighted (toggleable)
 *
 * `exclusive` — if true, none is not a valid state (radio-style, like PostMeta).
 *   Clicking the already-active button has no effect.
 *
 * Button visibility: onReply provided → reply shown; onBoost provided → boost shown.
 */

export type ActiveAction = 'reply' | 'boost' | 'none'

export interface InteractionBarProps {
    activeAction?: ActiveAction
    /** If true, one action is always active — clicking active does nothing (radio mode) */
    exclusive?: boolean
    onReply?: () => void
    onBoost?: () => void
}

const BASE: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    fontSize: 'inherit',
    fontFamily: 'inherit',
}

const Sep = () => <span style={{ opacity: 0.25, margin: '0 3px' }}>·</span>

export function InteractionBar({
    activeAction = 'none',
    exclusive = false,
    onReply,
    onBoost,
}: InteractionBarProps) {
    if (!onReply && !onBoost) return null

    const handleReply = () => {
        if (exclusive && activeAction === 'reply') return
        onReply?.()
    }

    const handleBoost = () => {
        if (exclusive && activeAction === 'boost') return
        onBoost?.()
    }

    return (
        <span className="interaction-bar" style={{ display: 'inline-flex', alignItems: 'center', fontSize: '8pt' }}>
            {onReply && (
                <button type="button" onClick={handleReply} data-action="reply"
                    style={{ ...BASE, color: activeAction === 'reply' ? 'var(--duki-400)' : 'var(--meta-color)' }}>
                    reply
                </button>
            )}
            {onReply && onBoost && <Sep />}
            {onBoost && (
                <button type="button" onClick={handleBoost} data-action="boost"
                    style={{ ...BASE, color: activeAction === 'boost' ? 'var(--duki-400)' : 'var(--meta-color)' }}>
                    boost
                </button>
            )}
        </span>
    )
}
