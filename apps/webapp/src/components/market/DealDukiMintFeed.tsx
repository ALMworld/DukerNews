/**
 * DealDukiMintFeed — Live feed of AlmWorldDukiMinter `DealDukiMinted` events.
 *
 * Used by both:
 *   • the /market landing page sidebar (recent activity across all agents)
 *   • /dukigen/$agentId (deals paid to a specific agent)
 *
 * Polls the worker's gRPC service via TanStack Query. Empty state and loading
 * state are both rendered inline so callers don't need to gate rendering on
 * data availability.
 */
import { useQuery } from '@tanstack/react-query'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { ExternalLink } from 'lucide-react'
import { getRecentDeals, getAgentDeals, type DealDukiMintedEvent } from '../../client/registry-api'
import { getChainNameForEid } from '../../lib/contracts'

interface DealDukiMintFeedProps {
    /** When set, scope to a single agent's deals; otherwise show recent across all agents. */
    agentId?: bigint | string
    /** When set, scope to a single chain (LayerZero EID); 0 / undefined = all chains. */
    chainEid?: number
    /** Title for the feed header. Defaults to "Market Activity" / "Recent Deals". */
    title?: string
    /** How many rows to fetch per page. Server caps at 100. */
    limit?: number
    /** Refetch interval in ms. Pass 0 to disable polling. */
    pollMs?: number
}

export function DealDukiMintFeed({
    agentId,
    chainEid = 0,
    title,
    limit = 20,
    pollMs = 15_000,
}: DealDukiMintFeedProps) {
    const scoped = agentId !== undefined && agentId !== null
    const headerTitle = title ?? (scoped ? 'Recent Deals' : 'Market Activity')

    const { data, isLoading } = useQuery({
        queryKey: ['deal-duki-minted', scoped ? String(agentId) : 'recent', chainEid, limit],
        queryFn: () =>
            scoped
                ? getAgentDeals(agentId as bigint | string, { chainEid, limit })
                : getRecentDeals({ chainEid, limit }),
        refetchInterval: pollMs > 0 ? pollMs : false,
        staleTime: 5_000,
    })

    const events = data?.events ?? []
    const [animationParent] = useAutoAnimate()

    const now = new Date()
    const liveTime = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}:${now.getUTCSeconds().toString().padStart(2, '0')}`

    return (
        <div className="flex flex-col rounded-xl border border-border bg-card/60 overflow-hidden flex-1 min-h-[300px]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <div className="flex items-center gap-2">
                    <span className="text-sm">⚡</span>
                    <h3 className="m-0 text-xs font-extrabold uppercase tracking-wider text-foreground">
                        {headerTitle}
                    </h3>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                    <span className="text-[9px] font-mono text-muted-foreground">LIVE: {liveTime}</span>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-3 py-2 scroll-smooth" style={{ scrollbarWidth: 'thin' }}>
                {isLoading && events.length === 0 ? (
                    <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
                        Loading deals…
                    </div>
                ) : events.length === 0 ? (
                    <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
                        {scoped ? 'No deals yet for this agent.' : 'Waiting for activity…'}
                    </div>
                ) : (
                    <div ref={animationParent} className="flex flex-col gap-0.5">
                        {events.map((evt) => (
                            <DealEventRow key={`${evt.chainEid}-${evt.sequence}`} event={evt} showAgent={!scoped} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Shared row ──────────────────────────────────────────────────────────
//
// One DealDukiMinted log rendered as a compact row. Used inline in the feed
// above; also exported so the agent detail page can reuse it in a wider
// list without duplicating the formatting helpers.

export function DealEventRow({ event, showAgent }: { event: DealDukiMintedEvent; showAgent?: boolean }) {
    const isTaiji = isZeroAddress(event.yinReceiver)
    const dukiD = formatD18(event.dukiAmount)
    const chainName = getChainNameForEid(event.chainEid)
    const explorer = explorerTxUrl(event.chainEid, event.txHash)

    return (
        <div className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/30">
            <span className="mt-0.5 text-sm flex-shrink-0">{isTaiji ? '☯' : '⚡'}</span>
            <div className="min-w-0 flex-1">
                <p className="m-0 text-[11px] font-semibold leading-snug text-foreground">
                    {shortAddr(event.minter)} paid <span className="font-mono">{dukiD}</span>{' '}
                    <span className="text-muted-foreground">DUKI</span>
                    {showAgent && event.agentId > 0n && (
                        <>
                            {' '}→ <span className="text-primary">Agent #{event.agentId.toString()}</span>
                        </>
                    )}
                </p>
                <p className="m-0 mt-0.5 text-[10px] text-muted-foreground inline-flex items-center gap-1.5 flex-wrap">
                    <span>{relTime(event.evtTime)}</span>
                    <span>·</span>
                    <span>{chainName}</span>
                    <span>·</span>
                    <span>seq {shortSeq(event.sequence)}</span>
                    {explorer && (
                        <>
                            <span>·</span>
                            <a
                                href={explorer}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors"
                            >
                                tx <ExternalLink size={9} />
                            </a>
                        </>
                    )}
                </p>
            </div>
        </div>
    )
}

// ── Formatting helpers ──────────────────────────────────────────────────

function isZeroAddress(addr: string): boolean {
    return !addr || /^0x0+$/i.test(addr)
}

function shortAddr(addr: string): string {
    if (!addr || addr.length < 12) return addr || '—'
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function shortSeq(seq: string): string {
    if (seq.length <= 8) return seq
    return `…${seq.slice(-6)}`
}

/** Format a uint256 d18 amount (string) as a human DUKI number with up to 4 decimals. */
function formatD18(raw: string): string {
    if (!raw || raw === '0') return '0'
    let big: bigint
    try { big = BigInt(raw) } catch { return raw }
    const whole = big / 10n ** 18n
    const frac = big % 10n ** 18n
    if (frac === 0n) return whole.toString()
    const fracStr = frac.toString().padStart(18, '0').slice(0, 4).replace(/0+$/, '')
    return fracStr ? `${whole}.${fracStr}` : whole.toString()
}

function relTime(unixSecs: bigint): string {
    const now = Math.floor(Date.now() / 1000)
    const diff = now - Number(unixSecs)
    if (diff < 60) return `${Math.max(diff, 0)}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
}

// Hard-coded explorer mapping — matches the chains the rest of the app targets.
// Stays here rather than in lib/contracts because this is a UI concern (feed
// links), not chain config that drives reads/writes.
function explorerTxUrl(chainEid: number, txHash: string): string {
    if (!txHash) return ''
    switch (chainEid) {
        case 30274: return `https://www.okx.com/web3/explorer/xlayer/tx/${txHash}`
        case 11155111: return `https://sepolia.etherscan.io/tx/${txHash}`
        case 30101: return `https://etherscan.io/tx/${txHash}`
        default: return ''
    }
}
