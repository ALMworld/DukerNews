/**
 * FeaturedAgentCard — Compact card for the landing page "Featured Agents" section.
 * Shows agent image, SN label, status badge, name, description, DUKI value, and CTA.
 */
import { Link } from '@tanstack/react-router'
import type { RankedAgentEntry } from '../../client/registry-api'

interface FeaturedAgentCardProps {
    entry: RankedAgentEntry
}

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string }> = {
    online: { label: 'ONLINE', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
    premium: { label: 'PREMIUM', bg: 'bg-violet-500/20', text: 'text-violet-400' },
    busy: { label: 'BUSY', bg: 'bg-amber-500/20', text: 'text-amber-400' },
}

function getAgentStatus(agentId: bigint): string {
    const id = Number(agentId)
    if (id % 3 === 0) return 'premium'
    if (id % 5 === 0) return 'busy'
    return 'online'
}

function getAgentDescription(agent: { productType: number; name: string }): string {
    const descs: Record<number, string> = {
        1: 'Specialized in digital asset management and automated data processing.',
        2: 'Expert in physical product distribution and supply chain optimization.',
        3: 'High-performance service agent with automated task orchestration.',
    }
    return descs[agent.productType] ?? 'Autonomous agent registered on the DukiGen network.'
}

export function FeaturedAgentCard({ entry }: FeaturedAgentCardProps) {
    const { agent, credibility } = entry
    const status = getAgentStatus(agent.agentId)
    const statusStyle = STATUS_STYLES[status]
    const snLabel = `SN: GEN-${String(agent.agentId).padStart(3, '0')}`

    return (
        <article className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card/60 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
            {/* Image area */}
            <div className="relative aspect-[16/9] overflow-hidden bg-muted">
                <img
                    src={agentGradientSvg(agent.agentId)}
                    alt=""
                    loading="lazy"
                    className="block h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-mono font-semibold text-white/80 backdrop-blur-sm">
                    {snLabel}
                </span>
                {statusStyle && (
                    <span className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${statusStyle.bg} ${statusStyle.text}`}>
                        {statusStyle.label}
                    </span>
                )}
            </div>

            {/* Body */}
            <div className="flex flex-1 flex-col p-3.5">
                <h3 className="m-0 text-sm font-bold leading-tight text-foreground truncate">
                    {agent.name || `Agent #${agent.agentId}`}
                </h3>
                <p className="mt-1 mb-0 text-[11px] leading-relaxed text-muted-foreground line-clamp-2 flex-1">
                    {getAgentDescription(agent)}
                </p>
                <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs font-bold tabular-nums text-primary">
                        ↗ {credibility.toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">DUKI/W</span>
                    </span>
                    <Link
                        to="/market_search"
                        search={{ q: agent.name || String(agent.agentId) }}
                        className="rounded-md border border-border bg-muted/50 px-3 py-1 text-[11px] font-semibold text-foreground no-underline transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary"
                    >
                        Lease Now
                    </Link>
                </div>
            </div>
        </article>
    )
}

function agentGradientSvg(agentId: bigint): string {
    const seed = Number(agentId % 360n)
    const hue = (seed * 47 + 220) % 360
    const hue2 = (hue + 60) % 360
    const initial = (String(agentId)).slice(0, 2) || 'AG'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 65% 25%)"/><stop offset="1" stop-color="hsl(${hue2} 55% 35%)"/></linearGradient><radialGradient id="r" cx="0.7" cy="0.3" r="0.6"><stop stop-color="hsla(${hue} 80% 60% / 0.3)"/><stop offset="1" stop-color="transparent"/></radialGradient></defs><rect width="400" height="300" fill="url(#g)"/><rect width="400" height="300" fill="url(#r)"/><circle cx="320" cy="60" r="80" fill="hsla(${hue2} 60% 45% / 0.15)"/><circle cx="80" cy="260" r="100" fill="hsla(${hue} 50% 20% / 0.2)"/><text x="200" y="170" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="64" font-weight="800" fill="rgba(255,255,255,0.12)">${initial}</text></svg>`
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
