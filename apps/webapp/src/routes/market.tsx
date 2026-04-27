/**
 * /market — World DukiGen Market.
 *
 * Lists every DUKIGEN agent ranked by credibility for the active timescale
 * (All / Year / Month / Week). The server does the metrics ⨝ agents JOIN and
 * returns rows already ordered + a cursor for the next page; the client just
 * appends pages.
 *
 * Favorites are a per-browser concept — they live on the user profile, not
 * here. The heart on each row toggles favorite state via lib/bookmarks.ts
 * (the storage layer keeps its old "bookmarks" name internally).
 */
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Search, Loader2, Plus, Activity } from 'lucide-react'
import { listAgentsRanked, type Timescale } from '../client/registry-api'
import { AgentRow } from '../components/AgentRow'

export const Route = createFileRoute('/market')({
    component: MarketPage,
})

const META = 'var(--meta-color)'
const FG = 'var(--foreground)'
const BDR = 'var(--border)'

const TIMESCALES: { id: Timescale; label: string }[] = [
    { id: 'all', label: 'All time' },
    { id: 'year', label: 'Year' },
    { id: 'month', label: 'Month' },
    { id: 'week', label: 'Week' },
]

const PAGE_SIZE = 50

function MarketPage() {
    const [scale, setScale] = useState<Timescale>('all')
    const [search, setSearch] = useState('')

    const {
        data, error, isLoading, isFetchingNextPage,
        fetchNextPage, hasNextPage,
    } = useInfiniteQuery({
        queryKey: ['market-ranked', scale],
        queryFn: ({ pageParam }) => listAgentsRanked(scale, pageParam, PAGE_SIZE),
        initialPageParam: '',
        getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
        staleTime: 30_000,
    })

    const items = useMemo(
        () => data?.pages.flatMap((p) => p.items) ?? [],
        [data],
    )

    // Search filters the loaded pages in-place. Server-side search is a
    // future optimization once the result set outgrows what fits on screen.
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return items
        return items.filter(({ agent }) => {
            if (agent.name && agent.name.toLowerCase().includes(q)) return true
            if (String(agent.agentId).includes(q)) return true
            if (agent.agentUri && agent.agentUri.toLowerCase().includes(q)) return true
            if (agent.website && agent.website.toLowerCase().includes(q)) return true
            return false
        })
    }, [items, search])

    return (
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12,
                marginBottom: 18,
            }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: FG, marginBottom: 2 }}>
                        World DukiGen Market
                    </h1>
                    <p style={{ fontSize: 12, color: META, lineHeight: 1.5, margin: 0 }}>
                        Every DUKIGEN agent registered on-chain, ranked by credibility.
                    </p>
                </div>
                <Link
                    to="/dukigen"
                    className="inline-flex items-center gap-1.5"
                    style={{
                        padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                        background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: '#fff',
                        textDecoration: 'none', whiteSpace: 'nowrap',
                    }}
                >
                    <Plus size={14} />
                    Register new agent
                </Link>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', maxWidth: 480, marginBottom: 12 }}>
                <Search
                    size={14}
                    style={{
                        position: 'absolute', left: 10, top: '50%',
                        transform: 'translateY(-50%)', color: META,
                    }}
                />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, id, or URI…"
                    style={{
                        width: '100%', boxSizing: 'border-box',
                        padding: '8px 12px 8px 32px', borderRadius: 8, fontSize: 13,
                        border: `1px solid ${BDR}`, background: 'var(--input)', color: FG,
                        outline: 'none',
                    }}
                />
            </div>

            {/* Timescale segmented control */}
            <div role="tablist" style={{
                display: 'inline-flex', borderRadius: 8, border: `1px solid ${BDR}`,
                overflow: 'hidden', marginBottom: 16,
            }}>
                {TIMESCALES.map((t, i) => {
                    const active = scale === t.id
                    return (
                        <button
                            key={t.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => setScale(t.id)}
                            style={{
                                padding: '6px 12px', fontSize: 12, fontWeight: 500,
                                background: active ? 'var(--muted)' : 'transparent',
                                color: active ? FG : META,
                                border: 'none', cursor: 'pointer',
                                borderRight: i < TIMESCALES.length - 1 ? `1px solid ${BDR}` : 'none',
                                transition: 'background 0.15s, color 0.15s',
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}
                        >
                            {i === 0 && <Activity size={11} />}
                            {t.label}
                        </button>
                    )
                })}
            </div>

            {/* Column header — gives the credibility column a label */}
            {filtered.length > 0 && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto auto 1fr auto',
                    columnGap: 8,
                    fontSize: 10, color: META, fontWeight: 500,
                    paddingBottom: 6,
                    borderBottom: `1px solid ${BDR}`,
                    textTransform: 'uppercase', letterSpacing: 0.4,
                }}>
                    <span style={{ width: 28 }} />
                    <span style={{ width: 22 }} />
                    <span>Agent</span>
                    <span style={{ minWidth: 64, textAlign: 'right' }}>Credibility</span>
                </div>
            )}

            {/* Body */}
            {isLoading ? (
                <EmptyState>
                    <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Loading agents…</span>
                </EmptyState>
            ) : error ? (
                <EmptyState tone="error">
                    Failed to load agents. The registry worker may be unreachable.
                </EmptyState>
            ) : filtered.length === 0 ? (
                search ? (
                    <EmptyState>No agents match "{search}".</EmptyState>
                ) : (
                    <EmptyState>
                        <span>No agents registered yet.</span>
                        <Link to="/dukigen" style={{ color: 'var(--duki-400)', textDecoration: 'underline' }}>
                            Be the first →
                        </Link>
                    </EmptyState>
                )
            ) : (
                <div>
                    {filtered.map((entry, idx) => (
                        <AgentRow
                            key={String(entry.agent.agentId)}
                            agent={entry.agent}
                            credibility={entry.credibility}
                            rank={idx + 1}
                        />
                    ))}
                </div>
            )}

            {/* Load more */}
            {!search && hasNextPage && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                    <button
                        type="button"
                        onClick={() => fetchNextPage()}
                        disabled={isFetchingNextPage}
                        style={{
                            padding: '8px 16px', fontSize: 12, fontWeight: 500,
                            background: 'transparent', color: META,
                            border: `1px solid ${BDR}`, borderRadius: 8,
                            cursor: isFetchingNextPage ? 'default' : 'pointer',
                            opacity: isFetchingNextPage ? 0.6 : 1,
                        }}
                    >
                        {isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </button>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
    )
}

function EmptyState({
    children,
    tone = 'neutral',
}: { children: React.ReactNode; tone?: 'neutral' | 'error' }) {
    return (
        <div
            style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '40px 16px', borderRadius: 12,
                border: `1px dashed ${BDR}`,
                color: tone === 'error' ? '#ef4444' : META,
                fontSize: 13,
                flexWrap: 'wrap',
            }}
        >
            {children}
        </div>
    )
}
