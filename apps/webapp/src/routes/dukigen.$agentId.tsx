/**
 * /dukigen/$agentId - DukiGen agent detail page.
 *
 * This page is intentionally different from the registration form: it reads
 * as a registry dossier with launch actions, metadata properties, deployed
 * contracts, and a live DealDukiMintFeed scoped to this agent.
 */
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
    Activity,
    ArrowLeft,
    BadgeCheck,
    Box,
    ExternalLink,
    FileText,
    Fingerprint,
    Globe,
    Hash,
    HeartHandshake,
    HeartPulse,
    Link2,
    Loader2,
    Network,
    WalletCards,
} from 'lucide-react'
import { getDukigenAgent } from '../client/registry-api'
import { getChainNameForEid } from '../lib/contracts'
import { DUKI_ICONS, PRODUCT_ICONS, PRODUCT_LABELS } from '../lib/constants'
import { DealDukiMintFeed } from '../components/market/DealDukiMintFeed'
import type { DukigenAgent } from '../client/registry-api'
import type { ReactNode } from 'react'

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
        <main className="mx-auto max-w-[1180px] px-4 pt-6 pb-14 text-foreground">
            <div className="mb-5 flex items-center justify-between gap-3">
                <Link
                    to="/market"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground no-underline transition-colors hover:text-foreground"
                >
                    <ArrowLeft size={13} /> Market
                </Link>
                <Link
                    to="/dukigen"
                    className="hidden items-center gap-1.5 rounded-md border border-border bg-muted/35 px-3 py-1.5 text-xs font-semibold text-foreground no-underline transition-colors hover:bg-muted sm:inline-flex"
                >
                    Register another
                </Link>
            </div>

            {isLoading ? (
                <div className="grid min-h-[360px] place-items-center rounded-lg border border-border bg-card/40">
                    <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 size={15} className="animate-spin" /> Loading agent dossier...
                    </div>
                </div>
            ) : error || !agent ? (
                <div className="rounded-lg border border-border bg-card/50 p-6 text-sm">
                    Agent <span className="font-mono">#{agentId}</span> not found.
                </div>
            ) : (
                <AgentDossier agent={agent} />
            )}
        </main>
    )
}

function AgentDossier({ agent }: { agent: DukigenAgent }) {
    const productLabel = PRODUCT_LABELS[agent.productType] ?? 'Unknown Product'
    const ProductIcon = PRODUCT_ICONS[agent.productType]
    const DukiIcon = DUKI_ICONS[agent.dukiType]
    const dukiTypeLabel = dukiTypeText(agent.dukiType)
    const websiteHref = normalizeUrl(agent.website)
    const pledgeHref = normalizeUrl(agent.pledgeUrl)

    return (
        <div className="space-y-8">
            <section
                className="relative overflow-hidden rounded-lg border border-border p-5 md:p-7"
                style={{
                    background:
                        'linear-gradient(135deg, color-mix(in srgb, var(--card) 88%, transparent), color-mix(in srgb, var(--accent) 16%, var(--background)))',
                }}
            >
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-[0.08]"
                    style={{
                        backgroundImage:
                            'linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)',
                        backgroundSize: '34px 34px',
                    }}
                />

                <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-stretch">
                    <div className="min-w-0">
                        <div className="mb-4 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/55 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                                <BadgeCheck size={12} /> DukiGen Registry
                            </span>
                            <span className="rounded-md border border-border bg-background/45 px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
                                #{String(agent.agentId)}
                            </span>
                        </div>

                        <h1 className="m-0 max-w-[760px] text-balance text-4xl font-black leading-[0.95] tracking-normal text-foreground md:text-6xl">
                            {agent.name || `Agent #${String(agent.agentId)}`}
                        </h1>

                        <div className="mt-5 grid gap-3 text-xs text-muted-foreground md:grid-cols-2">
                            <IdentityLine icon={<WalletCards size={14} />} label="Owner" value={agent.owner || 'Unassigned'} />
                            <IdentityLine icon={<Network size={14} />} label="Origin chain" value={getChainNameForEid(agent.originChainEid)} />
                        </div>

                        <div className="mt-6 flex flex-wrap gap-2">
                            <ExternalAction href={websiteHref} icon={<Globe size={15} />} label="Open website" fallback="Website missing" />
                            <ExternalAction href={pledgeHref} icon={<HeartHandshake size={15} />} label="Open pledge" fallback="Pledge missing" />
                        </div>
                    </div>

                    <div className="relative min-h-[220px] overflow-hidden rounded-lg border border-border bg-background/55">
                        <img
                            src={agentIdentitySvg(agent)}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                            loading="lazy"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent p-4">
                            <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                                Identity plate
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-3">
                                <span className="text-lg font-black text-foreground">
                                    {initials(agent.name)}
                                </span>
                                <span className="rounded-md bg-background/70 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                                    SN-{String(agent.agentId).padStart(5, '0')}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="relative mt-6 grid overflow-hidden rounded-lg border border-border bg-background/45 sm:grid-cols-2 lg:grid-cols-4">
                    <HeroStat icon={ProductIcon ? <ProductIcon size={15} /> : <Box size={15} />} label="Product" value={productLabel} />
                    <HeroStat icon={DukiIcon ? <DukiIcon size={15} /> : <HeartHandshake size={15} />} label="Duki policy" value={`${dukiTypeLabel} share`} />
                    <HeroStat icon={<HeartPulse size={15} />} label="Approx rate" value={`${formatBps(agent.approxBps)}%`} />
                    <HeroStat icon={<Activity size={15} />} label="Deployments" value={`${agent.chainContracts.length || 0} chain${agent.chainContracts.length === 1 ? '' : 's'}`} />
                </div>
            </section>

            <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start">
                <div className="space-y-7">
                    <MetadataProperties agent={agent} websiteHref={websiteHref} pledgeHref={pledgeHref} />
                    <DeployedContracts agent={agent} />
                </div>

                <aside className="lg:sticky lg:top-4">
                    <DealDukiMintFeed
                        agentId={agent.agentId}
                        title="Duki mints for this agent"
                        limit={18}
                        className="min-h-[560px]"
                    />
                </aside>
            </div>
        </div>
    )
}

function MetadataProperties({
    agent,
    websiteHref,
    pledgeHref,
}: {
    agent: DukigenAgent
    websiteHref: string
    pledgeHref: string
}) {
    const productLabel = PRODUCT_LABELS[agent.productType] ?? 'Unknown Product'
    const dukiTypeLabel = dukiTypeText(agent.dukiType)

    return (
        <section className="rounded-lg border border-border bg-card/45">
            <div className="border-b border-border px-5 py-4">
                <p className="m-0 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Registry record</p>
                <h2 className="m-0 mt-1 text-xl font-black leading-tight text-foreground">Metadata Properties</h2>
            </div>

            <div className="divide-y divide-border">
                <PropertyRow icon={<Fingerprint size={15} />} label="Agent ID" value={`#${String(agent.agentId)}`} />
                <PropertyRow icon={<Box size={15} />} label="Product type" value={productLabel} />
                <PropertyRow icon={<HeartHandshake size={15} />} label="DUKI type" value={`${dukiTypeLabel} share`} />
                <PropertyRow icon={<HeartPulse size={15} />} label="Approximate BPS" value={`${agent.approxBps.toLocaleString()} bps (${formatBps(agent.approxBps)}%)`} />
                <PropertyRow icon={<Network size={15} />} label="Origin chain" value={`${getChainNameForEid(agent.originChainEid)} / ${agent.originChainEid || 'unknown'}`} />
                <PropertyRow
                    icon={<Globe size={15} />}
                    label="Website URL"
                    value={agent.website ? stripScheme(agent.website) : 'Not provided'}
                    action={websiteHref ? <InlineOpenLink href={websiteHref}>Open website</InlineOpenLink> : null}
                />
                <PropertyRow
                    icon={<Link2 size={15} />}
                    label="Pledge URL"
                    value={agent.pledgeUrl ? stripScheme(agent.pledgeUrl) : 'Not provided'}
                    action={pledgeHref ? <InlineOpenLink href={pledgeHref}>Open pledge</InlineOpenLink> : null}
                />
                <PropertyRow icon={<WalletCards size={15} />} label="Owner wallet" value={agent.owner || 'Not provided'} mono />
                <PropertyRow icon={<WalletCards size={15} />} label="Agent wallet" value={agent.agentWallet || 'Not provided'} mono />
                <PropertyRow
                    icon={<FileText size={15} />}
                    label="Agent URI"
                    value={agent.agentUri || 'Not provided'}
                    mono
                    action={normalizeUrl(agent.agentUri) ? <InlineOpenLink href={normalizeUrl(agent.agentUri)}>Open URI</InlineOpenLink> : null}
                />
                <PropertyRow icon={<Hash size={15} />} label="URI hash" value={agent.agentUriHash || 'Not provided'} mono />
            </div>
        </section>
    )
}

function DeployedContracts({ agent }: { agent: DukigenAgent }) {
    return (
        <section className="rounded-lg border border-border bg-card/45">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                <div>
                    <p className="m-0 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Network surface</p>
                    <h2 className="m-0 mt-1 text-xl font-black leading-tight text-foreground">Deployed Contracts</h2>
                </div>
                <span className="rounded-md bg-muted px-2 py-1 text-xs font-bold text-muted-foreground">
                    {agent.chainContracts.length}
                </span>
            </div>

            {agent.chainContracts.length === 0 ? (
                <div className="px-5 py-8 text-sm text-muted-foreground">
                    No deployed contract addresses are registered for this agent yet.
                </div>
            ) : (
                <div className="divide-y divide-border">
                    {agent.chainContracts.map((contract, index) => (
                        <div key={`${contract.chainEid}-${contract.contractAddr}-${index}`} className="grid gap-2 px-5 py-4 md:grid-cols-[160px_1fr] md:items-center">
                            <div>
                                <div className="text-sm font-bold text-foreground">
                                    {getChainNameForEid(Number(contract.chainEid))}
                                </div>
                                <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                                    EID {Number(contract.chainEid)}
                                </div>
                            </div>
                            <div className="min-w-0 rounded-md border border-border bg-background/50 px-3 py-2 font-mono text-xs text-muted-foreground">
                                <span className="block truncate" title={contract.contractAddr}>
                                    {contract.contractAddr || 'No address'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    )
}

function HeroStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
    return (
        <div className="min-w-0 border-b border-border p-4 last:border-b-0 sm:border-r sm:last:border-r-0 lg:border-b-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {icon}
                {label}
            </div>
            <div className="mt-2 truncate text-lg font-black text-foreground" title={value}>
                {value}
            </div>
        </div>
    )
}

function IdentityLine({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
    return (
        <div className="min-w-0 rounded-md border border-border bg-background/45 px-3 py-2">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
                {icon}
                {label}
            </div>
            <div className="mt-1 truncate font-mono text-[12px]" title={value}>
                {value}
            </div>
        </div>
    )
}

function PropertyRow({
    icon,
    label,
    value,
    action,
    mono,
}: {
    icon: ReactNode
    label: string
    value: string
    action?: ReactNode
    mono?: boolean
}) {
    return (
        <div className="grid gap-2 px-5 py-4 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-center">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {icon}
                {label}
            </div>
            <div
                className={`min-w-0 break-words text-sm text-foreground ${mono ? 'font-mono text-xs leading-relaxed text-muted-foreground' : ''}`}
                title={value}
            >
                {value}
            </div>
            {action && <div className="flex md:justify-end">{action}</div>}
        </div>
    )
}

function ExternalAction({
    href,
    icon,
    label,
    fallback,
}: {
    href: string
    icon: ReactNode
    label: string
    fallback: string
}) {
    if (!href) {
        return (
            <span className="inline-flex items-center gap-2 rounded-md border border-dashed border-border bg-background/30 px-4 py-2 text-sm font-semibold text-muted-foreground">
                {icon}
                {fallback}
            </span>
        )
    }

    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-bold text-background no-underline transition-transform hover:-translate-y-0.5"
        >
            {icon}
            {label}
            <ExternalLink size={14} />
        </a>
    )
}

function InlineOpenLink({ href, children }: { href: string; children: ReactNode }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-bold text-foreground no-underline transition-colors hover:bg-muted"
        >
            {children}
            <ExternalLink size={12} />
        </a>
    )
}

function dukiTypeText(value: number): string {
    if (value === 1) return 'Revenue'
    if (value === 2) return 'Profit'
    return 'Unknown'
}

function formatBps(bps: number): string {
    return (bps / 100).toFixed(1)
}

function normalizeUrl(raw: string): string {
    const trimmed = raw.trim()
    if (!trimmed) return ''
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    if (/^(ipfs|ar):\/\//i.test(trimmed)) return ''
    return `https://${trimmed}`
}

function stripScheme(url: string): string {
    return url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return 'DG'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase()
}

function agentIdentitySvg(agent: DukigenAgent): string {
    const id = Number(agent.agentId % 360n)
    const hueA = (id * 47 + 28) % 360
    const hueB = (hueA + 142) % 360
    const hueC = (hueA + 74) % 360
    const mark = initials(agent.name)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 440">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop stop-color="hsl(${hueA} 46% 20%)"/>
<stop offset="0.58" stop-color="hsl(${hueB} 42% 24%)"/>
<stop offset="1" stop-color="hsl(${hueC} 54% 18%)"/>
</linearGradient>
<pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse">
<path d="M36 0H0V36" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
</pattern>
</defs>
<rect width="520" height="440" fill="url(#bg)"/>
<rect width="520" height="440" fill="url(#grid)"/>
<path d="M36 338L173 102L300 235L414 74L488 356" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="18" stroke-linejoin="round"/>
<path d="M52 354L190 141L305 270L427 120" fill="none" stroke="rgba(255,210,91,0.58)" stroke-width="8" stroke-linecap="round"/>
<circle cx="173" cy="102" r="22" fill="rgba(255,255,255,0.22)"/>
<circle cx="414" cy="74" r="18" fill="rgba(255,210,91,0.55)"/>
<text x="42" y="95" font-family="Inter, Arial, sans-serif" font-size="58" font-weight="900" fill="rgba(255,255,255,0.82)">${mark}</text>
<text x="42" y="134" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="18" font-weight="700" fill="rgba(255,255,255,0.5)">DUKIGEN #${String(agent.agentId)}</text>
</svg>`
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
