/**
 * AgentRow — single dense row for a DukigenAgent in /market and the
 * favorited-agents view. Mirrors the PostItem density (rank · ▲ · title · meta)
 * so the agent index feels like a sibling of the post index.
 */
import { useState } from 'react'
import { Heart, Globe, Network, FileText, HeartPulse, HeartHandshake } from 'lucide-react'
import type { DukigenAgent } from '../client/registry-api'
import { toggleBookmark, isBookmarked as isFavoritedFn } from '../lib/bookmarks'
import { PRODUCT_ICONS, PRODUCT_LABELS, DUKI_ICONS } from '../lib/constants'
import { ProductType, DukiType } from '@repo/dukernews-apidefs'

const META = 'var(--meta-color)'
const FG = 'var(--foreground)'
const BDR = 'var(--border)'
const FAV = '#e11d48'

export type AgentRowProps = {
    agent: DukigenAgent
    /** When undefined, the credibility column renders empty — used by the
     *  favorites view where ranking is not available. */
    credibility?: number
    rank?: number
}

export function AgentRow({ agent, credibility, rank }: AgentRowProps) {
    const [favorited, setFavorited] = useState<boolean>(() => isFavoritedFn(agent.agentId))
    const ProductIcon = PRODUCT_ICONS[agent.productType as ProductType]
    const DukiIcon = DUKI_ICONS[agent.dukiType as DukiType]
    const productLabel = PRODUCT_LABELS[agent.productType as ProductType] ?? 'Unknown'
    const dukiTypeLabel = agent.dukiType === 1 ? 'Revenue' : agent.dukiType === 2 ? 'Profit' : '—'

    const onToggle = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setFavorited(toggleBookmark(agent.agentId))
    }

    return (
        <article
            className="agent-row"
            style={{
                display: 'grid',
                gridTemplateColumns: 'auto auto 1fr auto',
                alignItems: 'baseline',
                columnGap: 8,
                padding: '6px 0',
                borderBottom: `1px dashed ${BDR}`,
            }}
        >
            {/* Rank */}
            <span
                style={{
                    width: 28,
                    textAlign: 'right',
                    color: META,
                    fontSize: 12,
                    fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1.4,
                }}
            >
                {rank !== undefined ? `${rank}.` : ''}
            </span>

            {/* Heart toggle */}
            <button
                type="button"
                onClick={onToggle}
                aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
                title={favorited ? 'Remove from favorites' : 'Add to favorites'}
                style={{
                    width: 22, height: 22,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    color: favorited ? FAV : META,
                    padding: 0,
                }}
            >
                <Heart
                    size={14}
                    fill={favorited ? FAV : 'transparent'}
                    stroke={favorited ? FAV : 'currentColor'}
                />
            </button>

            {/* Title + meta */}
            <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                    <span
                        style={{
                            fontSize: 13, fontWeight: 700, color: FG,
                            lineHeight: 1.3,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            maxWidth: '100%',
                        }}
                    >
                        {agent.name || '(unnamed)'}
                    </span>
                    {agent.website && (
                        <a
                            href={agent.website}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                fontSize: 10, color: META, textDecoration: 'none',
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                            }}
                        >
                            <Globe size={10} />
                            ({stripScheme(agent.website)})
                        </a>
                    )}
                </div>
                <div style={{
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
                    fontSize: 10, color: META, marginTop: 2,
                }}>
                    <span>id {String(agent.agentId)}</span>
                    <Pill icon={ProductIcon ? <ProductIcon size={9} /> : null} label={productLabel} />
                    <Pill icon={DukiIcon ? <DukiIcon size={9} /> : <HeartHandshake size={9} />} label={`${dukiTypeLabel} share`} />
                    <Pill icon={<HeartPulse size={9} />} label={`${(agent.approxBps / 100).toFixed(1)}%`} title="Avg DUKI rate" />
                    {agent.opContracts && agent.opContracts.length > 0 && (
                        <div className="flex items-center gap-1">
                            <Network size={11} />
                            {agent.opContracts.length} chain{agent.opContracts.length === 1 ? '' : 's'}
                        </div>
                    )}
                    {agent.agentUri && (
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            fontFamily: 'monospace', opacity: 0.7,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            maxWidth: 240,
                        }} title={agent.agentUri}>
                            <FileText size={10} />
                            {agent.agentUri}
                        </span>
                    )}
                </div>
            </div>

            {/* Credibility — right column, fixed slot keeps rows aligned */}
            <div style={{
                textAlign: 'right',
                color: 'var(--duki-400)',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                fontSize: 13,
                minWidth: 64,
            }}>
                {credibility !== undefined ? credibility.toLocaleString() : ''}
            </div>
        </article>
    )
}

function Pill({ icon, label, title }: { icon?: React.ReactNode; label: string; title?: string }) {
    return (
        <span
            title={title}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '1px 6px', borderRadius: 999, fontSize: 9, fontWeight: 500,
                background: 'color-mix(in srgb, var(--background) 50%, transparent)',
                border: `1px solid ${BDR}`, color: META,
                whiteSpace: 'nowrap',
            }}
        >
            {icon}
            {label}
        </span>
    )
}

function stripScheme(url: string): string {
    return url.replace(/^https?:\/\//, '')
}
