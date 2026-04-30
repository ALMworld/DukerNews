/**
 * MarketStats — Hero stats grid for the Market landing page.
 * Displays Total Agents, Total Volume, Active Chains, Transaction Count.
 */
import { useState } from 'react'
import { Copy, ExternalLink, X } from 'lucide-react'
import { getChainNameForEid } from '../../lib/contracts'
import { formatD6Amount } from '../../client/registry-api'
import type { AlmWorldDukiMinterOverview } from '../../client/registry-api'

export interface MarketStatsData {
    totalAgents: number
    totalVolume: string
    activeChains: number
    transactionCount: number
    chains: Array<AlmWorldDukiMinterOverview>
}

interface StatCardProps {
    label: string
    value: string | number
    suffix?: string
    onClick?: () => void
}

function StatCard({ label, value, suffix, onClick }: StatCardProps) {
    const className = 'rounded-lg border border-border bg-card/60 px-4 py-3 text-left backdrop-blur-sm transition-colors'
    const content = (
        <>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {label}
            </span>
            <span className="mt-1 block text-2xl font-extrabold tabular-nums text-foreground leading-tight">
                {value}
                {suffix && <span className="ml-1 text-sm font-semibold text-muted-foreground">{suffix}</span>}
            </span>
        </>
    )

    if (onClick) {
        return (
            <button type="button" onClick={onClick} className={`${className} cursor-pointer hover:border-primary/40 hover:bg-muted/40`}>
                {content}
            </button>
        )
    }

    return (
        <div className={className}>
            {content}
        </div>
    )
}

export function MarketStats({ stats }: { stats: MarketStatsData }) {
    const [mintersOpen, setMintersOpen] = useState(false)

    return (
        <>
            <div className="grid grid-cols-2 gap-2.5">
                <StatCard label="Total Agents" value={stats.totalAgents.toLocaleString()} />
                <StatCard label="Total Volume" value={stats.totalVolume} suffix="DUKI" />
                <StatCard label="Active Chains" value={stats.activeChains.toLocaleString()} />
                <StatCard
                    label="Transaction Count"
                    value={stats.transactionCount.toLocaleString()}
                    onClick={() => setMintersOpen(true)}
                />
            </div>

            {mintersOpen && (
                <MinterModal chains={stats.chains} onClose={() => setMintersOpen(false)} />
            )}
        </>
    )
}

function MinterModal({ chains, onClose }: { chains: Array<AlmWorldDukiMinterOverview>; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/75 px-4 backdrop-blur-sm" role="dialog" aria-modal="true">
            <div className="w-full max-w-[640px] overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
                <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                    <div>
                        <h3 className="m-0 text-base font-extrabold text-foreground">AlmWorldDukiMinter Contracts</h3>
                        <p className="m-0 mt-1 text-xs text-muted-foreground">Per-chain minter address and indexed event sequence.</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Close"
                    >
                        <X size={15} />
                    </button>
                </header>

                <div className="max-h-[60vh] overflow-y-auto p-3">
                    {chains.length === 0 ? (
                        <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                            No minter contracts are available in this overview.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {chains.map((chain) => (
                                <MinterRow key={chain.chainEid} chain={chain} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function MinterRow({ chain }: { chain: AlmWorldDukiMinterOverview }) {
    const explorer = explorerAddressUrl(chain.chainEid, chain.contractAddr)
    const copyAddress = async () => {
        try {
            await navigator.clipboard.writeText(chain.contractAddr)
        } catch {
            // Clipboard is best-effort here; the address remains visible.
        }
    }

    return (
        <article className="rounded-md border border-border bg-background/45 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-sm font-bold text-foreground">{getChainNameForEid(chain.chainEid)}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">eid {chain.chainEid}</div>
                </div>
                <div className="flex gap-2 text-right text-xs">
                    <div>
                        <div className="font-mono font-black tabular-nums text-foreground">{Number(chain.evtSeq).toLocaleString()}</div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">evt_seq</div>
                    </div>
                    <div>
                        <div className="font-mono font-black tabular-nums text-foreground">{formatD6Amount(chain.totalD6Amount)}</div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">DUKI</div>
                    </div>
                </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md bg-muted/55 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                    {chain.contractAddr}
                </code>
                <button
                    type="button"
                    onClick={copyAddress}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Copy minter address"
                >
                    <Copy size={13} />
                </button>
                {explorer && (
                    <a
                        href={explorer}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Open minter in explorer"
                    >
                        <ExternalLink size={13} />
                    </a>
                )}
            </div>
        </article>
    )
}

function explorerAddressUrl(chainEid: number, address: string): string {
    if (!address) return ''
    switch (chainEid) {
        case 30274: return `https://www.okx.com/web3/explorer/xlayer/address/${address}`
        case 11155111: return `https://sepolia.etherscan.io/address/${address}`
        case 30101: return `https://etherscan.io/address/${address}`
        default: return ''
    }
}
