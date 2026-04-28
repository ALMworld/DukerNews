/**
 * MarketStats — Hero stats grid for the Market landing page.
 * Displays Total Agents, Volume (24H), Active Chains, Transaction Count.
 */
import type { ReactNode } from 'react'

export interface MarketStatsData {
    totalAgents: number
    volume24h: string
    activeChains: number
    transactionCount: string
}

interface StatCardProps {
    label: string
    value: string | number
    suffix?: string
}

function StatCard({ label, value, suffix }: StatCardProps) {
    return (
        <div className="rounded-lg border border-border bg-card/60 px-4 py-3 backdrop-blur-sm">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {label}
            </span>
            <span className="mt-1 block text-2xl font-extrabold tabular-nums text-foreground leading-tight">
                {value}
                {suffix && <span className="ml-1 text-sm font-semibold text-muted-foreground">{suffix}</span>}
            </span>
        </div>
    )
}

export function MarketStats({ stats }: { stats: MarketStatsData }) {
    return (
        <div className="grid grid-cols-2 gap-2.5">
            <StatCard label="Total Agents" value={stats.totalAgents.toLocaleString()} />
            <StatCard label="Volume (24H)" value={stats.volume24h} suffix="DUKI" />
            <StatCard label="Active Chains" value={stats.activeChains.toLocaleString()} />
            <StatCard label="Transaction Count" value={stats.transactionCount} />
        </div>
    )
}
