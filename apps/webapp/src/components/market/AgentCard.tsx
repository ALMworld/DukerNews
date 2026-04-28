/**
 * AgentCard — Compact product-style card inspired by marketplace UIs.
 *
 * Layout:  Square image → Title → Tag pills → Price-style metric → Seller row
 */
import { PRODUCT_LABELS } from '../../lib/constants'
import type { RankedAgentEntry } from '../../client/registry-api'

interface AgentCardProps {
    entry: RankedAgentEntry
    rank: number
    favorited: boolean
    onFavorite: () => void
}

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string }> = {
    online: { label: 'ONLINE', bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
    busy: { label: 'BUSY', bg: 'bg-amber-500/15', text: 'text-amber-400' },
}

function getStatus(agentId: bigint) {
    return Number(agentId) % 5 === 0 ? 'busy' : 'online'
}

export function AgentCard({ entry, onFavorite }: AgentCardProps) {
    const { agent, credibility } = entry
    const productLabel = PRODUCT_LABELS[agent.productType as keyof typeof PRODUCT_LABELS] ?? 'Agent'
    const snId = `SN-${String(agent.agentId).padStart(5, '0')}`
    const status = getStatus(agent.agentId)
    const statusStyle = STATUS_STYLES[status]

    // Price-style metric: credibility score
    const score = credibility > 0
        ? (credibility / 100).toFixed(2)
        : (Number(agent.agentId) % 500 / 10).toFixed(2)
    const bps = agent.approxBps

    // Wants count (derived)
    const wants = (Number(agent.agentId) * 3 + credibility) % 12 + 1

    return (
        <a
            href={agent.website || undefined}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => {
                if (!agent.website) {
                    e.preventDefault()
                    onFavorite()
                }
            }}
            className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card/50 no-underline transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
        >
            {/* ── Square image ── */}
            <div className="relative aspect-square overflow-hidden bg-muted">
                <img
                    src={agentGradientSvg(agent.agentId)}
                    alt=""
                    loading="lazy"
                    className="block h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                {/* SN overlay — bottom-left */}
                <span className="absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-white/75 backdrop-blur-sm">
                    {snId}
                </span>
                {/* Status badge — top-right */}
                {statusStyle && (
                    <span className={`absolute top-1.5 right-1.5 rounded-full px-1.5 py-px text-[8px] font-bold uppercase tracking-wide ${statusStyle.bg} ${statusStyle.text}`}>
                        {statusStyle.label}
                    </span>
                )}
            </div>

            {/* ── Content body ── */}
            <div className="flex flex-1 flex-col px-2.5 pt-2 pb-2.5">
                {/* Title */}
                <h3 className="m-0 text-[13px] font-bold leading-snug text-foreground line-clamp-2 min-h-[2.4em]">
                    {agent.name || `Agent #${agent.agentId}`}
                </h3>

                {/* Tag pills row */}
                <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground leading-none">
                    <span>{productLabel}</span>
                    <span className="inline-block w-px h-2.5 bg-border mx-0.5" />
                    <span>{bps.toLocaleString()} bps</span>
                </div>

                {/* Price-style metric */}
                <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-[11px] font-bold text-primary leading-none">◆</span>
                    <span className="text-lg font-extrabold tabular-nums text-primary leading-none">{score}</span>
                    <span className="text-[10px] font-medium text-muted-foreground ml-1">DUKI</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">{wants}人想要</span>
                </div>

                {/* Seller row */}
                <div className="mt-2 flex items-center gap-1.5 border-t border-border/40 pt-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[8px] font-bold text-muted-foreground flex-shrink-0">
                        {(agent.name || 'A').charAt(0).toUpperCase()}
                    </div>
                    <span className="text-[11px] text-muted-foreground truncate flex-1">
                        {agent.owner ? `${agent.owner.slice(0, 6)}…${agent.owner.slice(-4)}` : 'Anonymous'}
                    </span>
                    <span className="flex-shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-bold text-primary leading-normal">
                        信用极好
                    </span>
                </div>
            </div>
        </a>
    )
}

// ── Inline gradient SVG as data URI ──────────────────────────────────────────

function agentGradientSvg(agentId: bigint): string {
    const seed = Number(agentId % 360n)
    const hue = (seed * 47 + 220) % 360
    const hue2 = (hue + 60) % 360
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 65% 25%)"/><stop offset="1" stop-color="hsl(${hue2} 55% 35%)"/></linearGradient><radialGradient id="r" cx="0.7" cy="0.3" r="0.6"><stop stop-color="hsla(${hue} 80% 60% / 0.3)"/><stop offset="1" stop-color="transparent"/></radialGradient></defs><rect width="240" height="240" fill="url(#g)"/><rect width="240" height="240" fill="url(#r)"/><circle cx="190" cy="50" r="60" fill="hsla(${hue2} 60% 45% / 0.15)"/><circle cx="50" cy="200" r="70" fill="hsla(${hue} 50% 20% / 0.2)"/></svg>`
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
