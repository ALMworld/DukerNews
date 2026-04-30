/**
 * AgentCard — Compact product-style card inspired by marketplace UIs.
 *
 * Layout:  Square image → Title → Tag pills → Price-style metric → Seller row
 */
import { Link } from '@tanstack/react-router'
import { Copy } from 'lucide-react'
import { PRODUCT_LABELS } from '../../lib/constants'
import { getChainNameForEid } from '../../lib/contracts'
import type { RankedAgentEntry } from '../../client/registry-api'
import type { MouseEvent } from 'react'

interface AgentCardProps {
    entry: RankedAgentEntry
    rank: number
    favorited: boolean
    onFavorite: () => void
}

export function AgentCard({ entry }: AgentCardProps) {
    const { agent, credibility } = entry
    const productLabel = PRODUCT_LABELS[agent.productType] ?? 'Agent'
    const snId = `SN-${String(agent.agentId).padStart(5, '0')}`
    const chainName = getChainNameForEid(agent.originChainEid)
    const keyword = productLabel.replace(/\s+Product$/i, '')

    // Price-style metric: credibility score
    const score = credibility > 0
        ? (credibility / 100).toFixed(2)
        : (Number(agent.agentId) % 500 / 10).toFixed(2)
    const bps = agent.approxBps

    const copyAgentId = async (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault()
        event.stopPropagation()
        try {
            await navigator.clipboard.writeText(String(agent.agentId))
        } catch {
            // The ID remains visible if clipboard access is unavailable.
        }
    }

    return (
        <Link
            to="/dukigen/$agentId"
            params={{ agentId: String(agent.agentId) }}
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
                <span className="absolute top-1.5 right-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-bold text-white/80 backdrop-blur-sm">
                    {chainName}
                </span>
            </div>

            {/* ── Content body ── */}
            <div className="flex flex-1 flex-col px-2.5 pt-2 pb-2.5">
                {/* Title */}
                <h3 className="m-0 text-[13px] font-bold leading-snug text-foreground line-clamp-2 min-h-[2.4em]">
                    {agent.name || `Agent #${agent.agentId}`}
                </h3>

                <div className="mt-1 flex min-w-0 items-center gap-1 rounded-md bg-muted/45 px-1.5 py-1">
                    <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                        ID {String(agent.agentId)}
                    </span>
                    <button
                        type="button"
                        onClick={copyAgentId}
                        className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border border-border bg-background/60 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Copy agent ID"
                    >
                        <Copy size={10} />
                    </button>
                </div>

                {/* Tag pills row */}
                <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground leading-none">
                    <span className="truncate">#{keyword}</span>
                    <span className="inline-block w-px h-2.5 bg-border mx-0.5" />
                    <span>{bps.toLocaleString()} bps</span>
                </div>

                {/* Price-style metric */}
                <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-[11px] font-bold text-primary leading-none">◆</span>
                    <span className="text-lg font-extrabold tabular-nums text-primary leading-none">{score}</span>
                    <span className="text-[10px] font-medium text-muted-foreground ml-1">DUKI</span>
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
        </Link>
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
