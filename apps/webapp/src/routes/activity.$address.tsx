/**
 * /activity/$address — Personal Contribution Dashboard
 *
 * Shows wallet-scoped DUKI metrics and a filtered deal-mint activity feed.
 * URL includes the wallet address so it can be shared/bookmarked.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
    CalendarDays,
    Coins,
    Copy,
    Hash,
    Layers,
    Loader2,
    TrendingUp,
    Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { getWalletDeals } from '../client/registry-api'
import { DealDukiMintFeed } from '../components/market/DealDukiMintFeed'
import type { DealDukiMintedEvent } from '../client/registry-api'
import type { ReactNode } from 'react'

export const Route = createFileRoute('/activity/$address')({
    component: ActivityPage,
})

function ActivityPage() {
    const { address } = Route.useParams()
    const [copied, setCopied] = useState(false)

    const { data, isLoading } = useQuery({
        queryKey: ['wallet-deals-stats', address],
        queryFn: () => getWalletDeals(address, { limit: 100 }),
        staleTime: 30_000,
    })

    const events = data?.events ?? []
    const stats = deriveStats(events)

    const copyAddress = () => {
        navigator.clipboard.writeText(address)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    return (
        <main className="mx-auto max-w-[1180px] px-4 pt-6 pb-14 text-foreground">
            {/* ── Hero ── */}
            <section
                className="relative mb-4 overflow-hidden rounded-lg border border-border p-5 md:p-7"
                style={{
                    background:
                        'linear-gradient(135deg, color-mix(in srgb, var(--card) 88%, transparent), color-mix(in srgb, var(--accent) 16%, var(--background)))',
                }}
            >
                {/* Grid pattern */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-[0.06]"
                    style={{
                        backgroundImage:
                            'linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)',
                        backgroundSize: '34px 34px',
                    }}
                />

                <div className="relative">
                    {/* Badge */}
                    <div className="mb-4">
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/55 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                            <Wallet size={12} /> Contribution Dashboard
                        </span>
                    </div>

                    {/* Title */}
                    <h1 className="m-0 text-2xl font-black leading-tight text-foreground md:text-3xl">
                        My Activity
                    </h1>

                    {/* Wallet address */}
                    <button
                        onClick={copyAddress}
                        className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-background/45 px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground"
                        style={{ cursor: 'pointer' }}
                    >
                        <Wallet size={12} />
                        {address}
                        <Copy size={10} className={copied ? 'text-primary' : 'opacity-40'} />
                        {copied && <span className="text-[10px] font-semibold text-primary">Copied!</span>}
                    </button>
                </div>
            </section>

            {/* ── Stats ── */}
            <section className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                {isLoading ? (
                    <div className="col-span-full grid min-h-[80px] place-items-center rounded-lg border border-border bg-card/60 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                            <Loader2 size={13} className="animate-spin" /> Loading…
                        </span>
                    </div>
                ) : (
                    <>
                        <StatCard icon={<CalendarDays size={13} />} label="First Active" value={stats.firstActive} />
                        <StatCard icon={<Coins size={13} />} label="Total DUKI" value={stats.totalDuki} suffix="DUKI" />
                        <StatCard icon={<Layers size={13} />} label="Agents" value={String(stats.uniqueAgents)} />
                        <StatCard icon={<Hash size={13} />} label="Transactions" value={String(stats.txCount)} />
                        <StatCard icon={<TrendingUp size={13} />} label="Avg / TX" value={stats.avgPerTx} suffix="DUKI" />
                    </>
                )}
            </section>

            {/* ── Feed ── */}
            <DealDukiMintFeed
                wallet={address}
                title="My DUKI Activity"
                limit={40}
                pollMs={0}
                compact
            />
        </main>
    )
}

// ── StatCard — matches MarketStats pattern ────────────────────────────────────

function StatCard({ icon, label, value, suffix }: { icon: ReactNode; label: string; value: string; suffix?: string }) {
    return (
        <div className="rounded-lg border border-border bg-card/60 px-4 py-3 backdrop-blur-sm">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {icon} {label}
            </span>
            <span className="mt-1 block truncate text-2xl font-extrabold tabular-nums leading-tight text-foreground" title={value}>
                {value}
                {suffix && value !== '0' && value !== '—' && (
                    <span className="ml-1 text-sm font-semibold text-muted-foreground">{suffix}</span>
                )}
            </span>
        </div>
    )
}

// ── Stats derivation ──────────────────────────────────────────────────────────

interface WalletStats {
    firstActive: string
    totalDuki: string
    uniqueAgents: number
    txCount: number
    avgPerTx: string
}

function deriveStats(events: DealDukiMintedEvent[]): WalletStats {
    if (events.length === 0) {
        return { firstActive: '—', totalDuki: '0', uniqueAgents: 0, txCount: 0, avgPerTx: '0' }
    }

    let earliest = Number(events[0].evtTime)
    let totalDuki = 0n
    const agents = new Set<string>()
    const txHashes = new Set<string>()

    for (const evt of events) {
        const t = Number(evt.evtTime)
        if (t > 0 && t < earliest) earliest = t
        try { totalDuki += BigInt(evt.dukiAmount || '0') } catch { /* skip */ }
        if (evt.agentId > 0n) agents.add(String(evt.agentId))
        if (evt.txHash) txHashes.add(evt.txHash)
    }

    const txCount = txHashes.size || events.length
    const avg = txCount > 0 ? totalDuki / BigInt(txCount) : 0n

    return {
        firstActive: earliest > 0
            ? new Date(earliest * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
            : '—',
        totalDuki: formatD18(totalDuki.toString()),
        uniqueAgents: agents.size,
        txCount,
        avgPerTx: formatD18(avg.toString()),
    }
}

function formatD18(raw: string): string {
    if (!raw || raw === '0') return '0'
    let big: bigint
    try { big = BigInt(raw) } catch { return raw }
    const whole = big / 10n ** 18n
    const frac = big % 10n ** 18n
    if (frac === 0n) return whole.toLocaleString()
    const fracStr = frac.toString().padStart(18, '0').slice(0, 2)
    const wholeStr = whole.toLocaleString()
    return `${wholeStr}.${fracStr}`
}
