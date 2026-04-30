/**
 * DealDukiMintFeed - Live feed of AlmWorldDukiMinter `DealDukiMinted` events.
 *
 * Shared by:
 *   - /market: latest events across every agent
 *   - /dukigen/$agentId: latest events filtered to one agent
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import {
    Activity,
    ArrowUpRight,
    CircleDollarSign,
    Coins,
    ExternalLink,
    Radio,
    RefreshCw,
    Rows3,
} from 'lucide-react'
import { getAgentDeals, getRecentDeals, getWalletDeals } from '../../client/registry-api'
import { getChainNameForEid } from '../../lib/contracts'
import { cn } from '../../lib/utils'
import type { DealDukiMintedEvent } from '../../client/registry-api'

interface DealDukiMintFeedProps {
    /** When set, scope to a single agent's deals; otherwise show recent across all agents. */
    agentId?: bigint | string
    /** When set, scope to deals involving this wallet address (minter or receiver). */
    wallet?: string
    /** When set, scope to a single chain (LayerZero EID); 0 / undefined = all chains. */
    chainEid?: number
    /** Title for the feed header. Defaults to "Agent Deal Mints" / "Market Activity". */
    title?: string
    /** How many rows to fetch per page. Server caps at 100. */
    limit?: number
    /** Refetch interval in ms. Pass 0 to disable polling. */
    pollMs?: number
    /** When true, show a slim metadata-only header (row count + updated time) instead of the full title row. */
    compact?: boolean
    /** Preloaded events from an aggregate loader. When provided, the feed skips its own query. */
    initialEvents?: Array<DealDukiMintedEvent>
    className?: string
}

export function DealDukiMintFeed({
    agentId,
    wallet,
    chainEid = 0,
    title,
    limit = 20,
    pollMs = 15_000,
    compact,
    initialEvents,
    className,
}: DealDukiMintFeedProps) {
    const scoped = agentId !== undefined
    const walletScoped = !!wallet
    const scopeKey = scoped ? String(agentId) : walletScoped ? wallet : 'all-agents'
    const headerTitle = title ?? (scoped ? 'Agent Deal Mints' : walletScoped ? 'My Activity' : 'Market Activity')

    const { data, dataUpdatedAt, isFetching, isLoading } = useQuery({
        queryKey: ['deal-duki-minted', scoped ? 'agent' : walletScoped ? 'wallet' : 'recent', scopeKey, chainEid, limit],
        queryFn: () => {
            if (agentId !== undefined) {
                return getAgentDeals(agentId, { chainEid, limit })
            }
            if (wallet) {
                return getWalletDeals(wallet, { chainEid, limit })
            }
            return getRecentDeals({ chainEid, limit })
        },
        refetchInterval: pollMs > 0 ? pollMs : false,
        refetchIntervalInBackground: true,
        refetchOnMount: 'always',
        refetchOnReconnect: true,
        refetchOnWindowFocus: true,
        staleTime: 0,
        placeholderData: (previous) => previous,
        enabled: initialEvents === undefined,
    })

    const events = sortDealsNewestFirst(data?.events ?? initialEvents ?? [])
    const [animationParent] = useAutoAnimate()

    return (
        <section className={cn('flex min-h-[300px] flex-col overflow-hidden rounded-lg border border-border bg-card/60', className)}>
            <header className="border-b border-border bg-background/40 px-4 py-3">
                {compact ? (
                    /* ── Compact: metadata-only bar ── */
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1 rounded-md bg-muted/55 px-2 py-1">
                                <Rows3 size={11} />
                                {events.length} row{events.length === 1 ? '' : 's'}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-md bg-muted/55 px-2 py-1">
                                <Radio size={11} />
                                Updated {formatUpdatedAt(dataUpdatedAt)}
                            </span>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <RefreshCw size={10} className={isFetching ? 'animate-spin' : ''} />
                            {pollMs > 0 ? `${formatPoll(pollMs)} poll` : 'manual'}
                        </span>
                    </div>
                ) : (
                    /* ── Full header ── */
                    <>
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background">
                                        <Activity size={14} />
                                    </span>
                                    <div className="min-w-0">
                                        <h3 className="m-0 truncate text-sm font-black leading-tight text-foreground">
                                            {headerTitle}
                                        </h3>
                                        <p className="m-0 mt-0.5 truncate text-[11px] text-muted-foreground">
                                            {scoped ? `Filtered to Agent #${scopeKey}` : walletScoped ? `Wallet ${scopeKey.slice(0, 6)}...${scopeKey.slice(-4)}` : 'Latest events across DukiGen'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex shrink-0 flex-col items-end gap-1">
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-500">
                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                                    Live
                                </span>
                                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <RefreshCw size={10} className={isFetching ? 'animate-spin' : ''} />
                                    {pollMs > 0 ? `${formatPoll(pollMs)} poll` : 'manual'}
                                </span>
                            </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1 rounded-md bg-muted/55 px-2 py-1">
                                <Rows3 size={11} />
                                {events.length} row{events.length === 1 ? '' : 's'}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-md bg-muted/55 px-2 py-1">
                                <Radio size={11} />
                                Updated {formatUpdatedAt(dataUpdatedAt)}
                            </span>
                        </div>
                    </>
                )}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5" style={{ scrollbarWidth: 'thin' }}>
                {isLoading && events.length === 0 ? (
                    <LoadingRows />
                ) : events.length === 0 ? (
                    <EmptyFeed scoped={scoped} />
                ) : (
                    <div ref={animationParent} className="flex flex-col gap-1">
                        {events.map((evt) => (
                            <DealEventRow
                                key={`${evt.chainEid}-${evt.sequence}-${evt.txHash}`}
                                event={evt}
                                showAgent={!scoped}
                            />
                        ))}
                    </div>
                )}
            </div>
        </section>
    )
}

export function DealEventRow({ event, showAgent }: { event: DealDukiMintedEvent; showAgent?: boolean }) {
    const isTaiji = isZeroAddress(event.yinReceiver)
    const dukiD = formatD18(event.dukiAmount)
    const almD = formatD18((safeBigInt(event.almYangAmount) + safeBigInt(event.almYinAmount)).toString())
    const chainName = getChainNameForEid(event.chainEid)
    const explorer = explorerTxUrl(event.chainEid, event.txHash)

    return (
        <article className="group grid gap-3 rounded-md border border-transparent px-2.5 py-3 transition-colors hover:border-border hover:bg-muted/30 sm:grid-cols-[34px_minmax(0,1fr)_auto]">
            <div className="flex sm:block">
                <span
                    className={cn(
                        'inline-flex h-8 w-8 items-center justify-center rounded-md border text-[11px] font-black',
                        isTaiji
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
                    )}
                    title={isTaiji ? 'Taiji mint' : 'Deal mint'}
                >
                    {isTaiji ? 'TJ' : 'DL'}
                </span>
            </div>

            <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="inline-flex items-center gap-1 text-sm font-bold text-foreground">
                        <CircleDollarSign size={13} />
                        {shortAddr(event.minter)}
                    </span>
                    <ArrowUpRight size={12} className="text-muted-foreground" />
                    <span className="font-mono text-xs text-muted-foreground">
                        {shortAddr(event.yangReceiver)}
                    </span>
                    {showAgent && event.agentId > 0n && (
                        <Link
                            to="/dukigen/$agentId"
                            params={{ agentId: String(event.agentId) }}
                            className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary no-underline hover:bg-primary/15"
                        >
                            Agent #{String(event.agentId)}
                        </Link>
                    )}
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span>{relTime(event.evtTime)}</span>
                    <span className="h-1 w-1 rounded-full bg-border" />
                    <span>{chainName}</span>
                    <span className="h-1 w-1 rounded-full bg-border" />
                    <span>block {String(event.blockNumber)}</span>
                    <span className="h-1 w-1 rounded-full bg-border" />
                    <span>seq {shortSeq(event.sequence)}</span>
                    {event.stablecoin && (
                        <>
                            <span className="h-1 w-1 rounded-full bg-border" />
                            <span title={event.stablecoin}>stable {shortAddr(event.stablecoin)}</span>
                        </>
                    )}
                    {explorer && (
                        <>
                            <span className="h-1 w-1 rounded-full bg-border" />
                            <a
                                href={explorer}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 font-bold text-foreground no-underline opacity-70 transition-opacity hover:opacity-100"
                            >
                                tx <ExternalLink size={10} />
                            </a>
                        </>
                    )}
                </div>
            </div>

            <div className="flex items-end justify-between gap-3 border-t border-border/60 pt-2 sm:block sm:border-t-0 sm:pt-0 sm:text-right">
                <div>
                    <div className="font-mono text-sm font-black tabular-nums text-foreground">
                        {dukiD}
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        DUKI minted
                    </div>
                </div>
                <div className="inline-flex items-center gap-1 text-[10px] text-muted-foreground sm:mt-2 sm:justify-end">
                    <Coins size={11} />
                    {almD} ALM
                </div>
            </div>
        </article>
    )
}

function LoadingRows() {
    return (
        <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="grid gap-3 rounded-md px-2.5 py-3 sm:grid-cols-[34px_minmax(0,1fr)_70px]">
                    <div className="h-8 w-8 animate-pulse rounded-md bg-muted" />
                    <div className="space-y-2">
                        <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                        <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
                    </div>
                    <div className="hidden space-y-2 sm:block">
                        <div className="ml-auto h-3 w-14 animate-pulse rounded bg-muted" />
                        <div className="ml-auto h-2.5 w-10 animate-pulse rounded bg-muted" />
                    </div>
                </div>
            ))}
        </div>
    )
}

function EmptyFeed({ scoped }: { scoped: boolean }) {
    return (
        <div className="grid min-h-[180px] place-items-center rounded-md border border-dashed border-border bg-background/35 px-6 py-8 text-center">
            <div>
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Activity size={18} />
                </div>
                <p className="m-0 mt-3 text-sm font-bold text-foreground">
                    {scoped ? 'No mints for this agent yet' : 'No DUKI mint events yet'}
                </p>
                <p className="m-0 mt-1 text-xs text-muted-foreground">
                    The feed refreshes automatically as the registry worker indexes new events.
                </p>
            </div>
        </div>
    )
}

function sortDealsNewestFirst(events: Array<DealDukiMintedEvent>): Array<DealDukiMintedEvent> {
    return [...events].sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return a.blockNumber > b.blockNumber ? -1 : 1
        const aSeq = safeBigInt(a.sequence)
        const bSeq = safeBigInt(b.sequence)
        if (aSeq !== bSeq) return aSeq > bSeq ? -1 : 1
        return 0
    })
}

function isZeroAddress(addr: string): boolean {
    return !addr || /^0x0+$/i.test(addr)
}

function shortAddr(addr: string): string {
    if (!addr || addr.length < 12) return addr || '-'
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function shortSeq(seq: string): string {
    if (seq.length <= 8) return seq
    return `...${seq.slice(-6)}`
}

/** Format a uint256 d18 amount (string) as a human DUKI number with up to 4 decimals. */
function formatD18(raw: string): string {
    if (!raw || raw === '0') return '0'
    let big: bigint
    try { big = BigInt(raw) } catch { return raw }
    const whole = big / 10n ** 18n
    const frac = big % 10n ** 18n
    if (frac === 0n) return whole.toLocaleString()
    const fracStr = frac.toString().padStart(18, '0').slice(0, 4).replace(/0+$/, '')
    const wholeStr = whole.toLocaleString()
    return fracStr ? `${wholeStr}.${fracStr}` : wholeStr
}

function safeBigInt(raw: string): bigint {
    try { return BigInt(raw || '0') } catch { return 0n }
}

function relTime(unixSecs: bigint): string {
    const now = Math.floor(Date.now() / 1000)
    const diff = now - Number(unixSecs)
    if (diff < 60) return `${Math.max(diff, 0)}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
}

function formatUpdatedAt(ms: number): string {
    if (!ms) return 'pending'
    return new Date(ms).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    })
}

function formatPoll(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    return `${Math.round(ms / 1000)}s`
}

// Hard-coded explorer mapping matches the chains the rest of the app targets.
function explorerTxUrl(chainEid: number, txHash: string): string {
    if (!txHash) return ''
    switch (chainEid) {
        case 30274: return `https://www.okx.com/web3/explorer/xlayer/tx/${txHash}`
        case 11155111: return `https://sepolia.etherscan.io/tx/${txHash}`
        case 30101: return `https://etherscan.io/tx/${txHash}`
        default: return ''
    }
}
