/**
 * /dukigen/$agentId — DukiGen agent detail page.
 *
 * Two stacked sections:
 *   1. Agent properties — name, NFT-style attribute chips, website / pledge,
 *      agent URI, deployed contracts. Read straight from the registry worker.
 *   2. DealDukiMintFeed scoped to this agent — real on-chain deals indexed
 *      from the AlmWorldDukiMinter contract.
 */
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
    Loader2, ExternalLink, Globe, Network, Hash, FileText, HeartHandshake, HeartPulse, ArrowLeft,
} from 'lucide-react'
import { getDukigenAgent, type DukigenAgent } from '../client/registry-api'
import { getChainNameForEid } from '../lib/contracts'
import { PRODUCT_LABELS, PRODUCT_ICONS, DUKI_ICONS } from '../lib/constants'
import type { ProductType, DukiType } from '@repo/dukernews-apidefs'
import { DealDukiMintFeed } from '../components/market/DealDukiMintFeed'

export const Route = createFileRoute('/dukigen/$agentId')({
    component: AgentDetailPage,
})

function AgentDetailPage() {
    const { agentId } = Route.useParams()

    const { data: agent, isLoading, error } = useQuery({
        queryKey: ['dukigen-agent', agentId],
        queryFn: () => getDukigenAgent(agentId),
        staleTime: 60_000,
    })

    return (
        <div className="mx-auto max-w-[1100px] px-4 pt-6 pb-12">
            <div className="mb-4">
                <Link
                    to="/market"
                    className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground no-underline transition-colors hover:text-foreground"
                >
                    <ArrowLeft size={12} /> Back to market
                </Link>
            </div>

            {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 size={14} className="animate-spin" /> Loading agent…
                </div>
            ) : error || !agent ? (
                <div className="rounded-lg border border-border bg-card/40 p-6 text-sm">
                    Agent <span className="font-mono">#{agentId}</span> not found.
                </div>
            ) : (
                <div className="flex flex-col lg:flex-row gap-6">
                    <section className="flex-1 min-w-0">
                        <AgentPropertiesCard agent={agent} />
                    </section>
                    <aside className="w-full lg:w-[360px] flex-shrink-0 flex">
                        <DealDukiMintFeed agentId={agent.agentId} title="Deals to this agent" />
                    </aside>
                </div>
            )}
        </div>
    )
}

// ── Agent properties card ───────────────────────────────────────────────
//
// Visually mirrors the small AgentPreviewCard in /submit but laid out for
// a full page rather than a sidebar — bigger header, more breathing room
// between rows. Field source is identical (DukigenAgent from the registry
// worker), so the same NFT-attributes framing applies.

function AgentPropertiesCard({ agent }: { agent: DukigenAgent }) {
    const productLabel = PRODUCT_LABELS[agent.productType as ProductType] ?? 'Unknown'
    const ProductIcon = PRODUCT_ICONS[agent.productType as ProductType]
    const DukiIcon = DUKI_ICONS[agent.dukiType as DukiType]
    const dukiTypeLabel =
        agent.dukiType === 1 ? 'Revenue'
        : agent.dukiType === 2 ? 'Profit'
        : '—'

    return (
        <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
            {/* Header row */}
            <div className="px-5 py-4 border-b border-border/50">
                <div className="flex items-baseline gap-3 flex-wrap">
                    <h1 className="m-0 text-2xl font-extrabold leading-tight text-foreground">
                        {agent.name || `Agent #${agent.agentId}`}
                    </h1>
                    <span className="text-xs text-muted-foreground font-mono">
                        #{String(agent.agentId)}
                    </span>
                </div>

                {/* NFT-attribute chips */}
                <div className="mt-3 flex flex-wrap gap-2">
                    <Prop
                        label="Product"
                        icon={ProductIcon ? <ProductIcon size={11} /> : null}
                        value={productLabel}
                    />
                    <Prop
                        label="DUKI"
                        icon={DukiIcon ? <DukiIcon size={11} /> : <HeartHandshake size={11} />}
                        value={`${dukiTypeLabel} share`}
                    />
                    <Prop
                        label="Avg %"
                        icon={<HeartPulse size={11} />}
                        value={`${(agent.approxBps / 100).toFixed(1)}%`}
                    />
                </div>
            </div>

            {/* Website + pledge */}
            {(agent.website || agent.pledgeUrl) && (
                <Row>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        {agent.website && (
                            <a
                                href={agent.website}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 text-primary hover:opacity-80"
                            >
                                <Globe size={13} />
                                <span className="truncate" style={{ maxWidth: 360 }}>
                                    {stripScheme(agent.website)}
                                </span>
                            </a>
                        )}
                        {agent.pledgeUrl && (
                            <a
                                href={agent.pledgeUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:opacity-80"
                                title={agent.pledgeUrl}
                            >
                                <ExternalLink size={12} />
                                <span>Pledge</span>
                            </a>
                        )}
                    </div>
                </Row>
            )}

            {/* Owner / wallet */}
            {(agent.owner || agent.agentWallet) && (
                <Row>
                    <div className="flex flex-col gap-0.5 text-xs">
                        {agent.owner && (
                            <div>
                                <span className="text-muted-foreground">Owner&nbsp;</span>
                                <span className="font-mono">{agent.owner}</span>
                            </div>
                        )}
                        {agent.agentWallet && agent.agentWallet !== agent.owner && (
                            <div>
                                <span className="text-muted-foreground">Wallet&nbsp;</span>
                                <span className="font-mono">{agent.agentWallet}</span>
                            </div>
                        )}
                    </div>
                </Row>
            )}

            {/* Agent URI + hash */}
            {agent.agentUri && (
                <Row>
                    <div className="flex items-start gap-1.5 text-xs">
                        <FileText size={12} className="mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                            <div className="truncate font-mono" title={agent.agentUri}>
                                {agent.agentUri}
                            </div>
                            {agent.agentUriHash && (
                                <div
                                    className="truncate font-mono opacity-60 inline-flex items-center gap-1 mt-0.5"
                                    title={agent.agentUriHash}
                                >
                                    <Hash size={10} />
                                    {agent.agentUriHash}
                                </div>
                            )}
                        </div>
                    </div>
                </Row>
            )}

            {/* Deployed contracts */}
            {agent.chainContracts && agent.chainContracts.length > 0 && (
                <Row>
                    <div className="flex items-start gap-1.5 text-xs">
                        <Network size={12} className="mt-0.5 flex-shrink-0" />
                        <div className="flex flex-wrap gap-1.5 min-w-0">
                            {agent.chainContracts.map((c, i) => (
                                <span
                                    key={i}
                                    className="rounded-md border border-border bg-muted/40 px-2 py-0.5 inline-flex items-center gap-1.5 font-mono text-[11px]"
                                    title={c.contractAddr}
                                >
                                    <span className="opacity-60">{getChainNameForEid(Number(c.chainEid))}</span>
                                    <span>{shortAddr(c.contractAddr)}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                </Row>
            )}
        </div>
    )
}

function Row({ children }: { children: React.ReactNode }) {
    return (
        <div className="px-5 py-3 border-t border-border/50">
            {children}
        </div>
    )
}

function Prop({ label, value, icon }: {
    label: string
    value: React.ReactNode
    icon?: React.ReactNode
}) {
    return (
        <span
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px]"
        >
            <span className="text-muted-foreground opacity-70">{label}</span>
            <span className="inline-flex items-center gap-1 font-medium">
                {icon}
                {value}
            </span>
        </span>
    )
}

// ── Address / URL helpers ──────────────────────────────────────────────

function stripScheme(url: string): string {
    return url.replace(/^https?:\/\//, '')
}

function shortAddr(addr: string): string {
    if (!addr || addr.length < 12) return addr || '—'
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
