/**
 * /market — World DukiGen Market.
 *
 * Browse all DUKIGEN agents (data sourced from worker-dukiregistry-api via
 * the existing GetAgents RPC), search by name / id / agentURI, and bookmark
 * the ones you care about. Bookmarks are stored client-side in localStorage
 * — see lib/bookmarks.ts.
 *
 * This page also owns the "Register new agent" CTA. The submit form used to
 * have its own link out to /dukigen, but registration belongs in the market
 * context, not the post-creation context.
 */
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
    Search, Star, BookmarkCheck, ExternalLink, Loader2,
    Plus, Globe, Network, FileText, HeartPulse, HeartHandshake,
} from 'lucide-react'
import { getDukigenAgents, type DukigenAgent } from '../client/registry-api'
import { useBookmarks, toggleBookmark, isBookmarked as isBookmarkedFn } from '../lib/bookmarks'
import { PRODUCT_ICONS, PRODUCT_LABELS, DUKI_ICONS } from '../lib/constants'
import { ProductType, DukiType } from '@repo/dukernews-apidefs'

export const Route = createFileRoute('/market')({
    component: MarketPage,
})

// ── Design tokens ──────────────────────────────────────────────────────────
const META = 'var(--meta-color)'
const FG = 'var(--foreground)'
const BDR = 'var(--border)'

type Tab = 'all' | 'bookmarks'

function MarketPage() {
    const [tab, setTab] = useState<Tab>('all')
    const [search, setSearch] = useState('')

    // Pull a single page of up to 100 agents. The TanStack Query cache keeps
    // the list around between visits, and the `staleTime` lets us avoid
    // re-fetching on every navigation.
    const { data, isLoading, error } = useQuery({
        queryKey: ['dukigen-agents', 'list'],
        queryFn: () => getDukigenAgents({ page: 1, perPage: 100 }),
        staleTime: 30_000,
    })

    const { bookmarks } = useBookmarks()
    const bookmarkSet = useMemo(() => new Set(bookmarks), [bookmarks])

    const visible = useMemo<DukigenAgent[]>(() => {
        let list = data?.agents ?? []
        if (tab === 'bookmarks') {
            list = list.filter((a) => bookmarkSet.has(String(a.agentId)))
        }
        const q = search.trim().toLowerCase()
        if (q) {
            list = list.filter((a) => {
                if (a.name && a.name.toLowerCase().includes(q)) return true
                if (String(a.agentId).includes(q)) return true
                if (a.agentUri && a.agentUri.toLowerCase().includes(q)) return true
                if (a.website && a.website.toLowerCase().includes(q)) return true
                return false
            })
        }
        return list
    }, [data, tab, bookmarkSet, search])

    const totalAll = data?.agents?.length ?? 0
    const totalBookmarks = bookmarkSet.size

    return (
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: FG, marginBottom: 2 }}>
                        World DukiGen Market
                    </h1>
                    <p style={{ fontSize: 12, color: META, lineHeight: 1.5, margin: 0 }}>
                        Every DUKIGEN agent registered on-chain — searchable, bookmarkable, and ready to attach to a post.
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

            {/* ── Filter bar: tabs + search ── */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                {/* Tabs */}
                <div role="tablist" style={{ display: 'inline-flex', borderRadius: 8, border: `1px solid ${BDR}`, overflow: 'hidden' }}>
                    <TabButton active={tab === 'all'} onClick={() => setTab('all')}>
                        All <span style={{ opacity: 0.5, marginLeft: 4 }}>{totalAll}</span>
                    </TabButton>
                    <TabButton active={tab === 'bookmarks'} onClick={() => setTab('bookmarks')}>
                        <BookmarkCheck size={12} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                        Bookmarks <span style={{ opacity: 0.5, marginLeft: 4 }}>{totalBookmarks}</span>
                    </TabButton>
                </div>

                {/* Search */}
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <Search
                        size={14}
                        style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: META }}
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
            </div>

            {/* ── Body ── */}
            {isLoading ? (
                <EmptyState>
                    <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Loading agents…</span>
                </EmptyState>
            ) : error ? (
                <EmptyState tone="error">
                    Failed to load agents. The registry worker may be unreachable.
                </EmptyState>
            ) : visible.length === 0 ? (
                tab === 'bookmarks' ? (
                    <EmptyState>
                        <Star size={20} />
                        <span>No bookmarks yet — tap the star on any agent to save it here.</span>
                    </EmptyState>
                ) : search ? (
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                    {visible.map((a) => (
                        <AgentCard key={String(a.agentId)} agent={a} />
                    ))}
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
    )
}

// ── AgentCard ──────────────────────────────────────────────────────────────
// One tile in the grid. Compact summary + bookmark toggle. The whole card is
// a Link to /submit?agentId=N once we wire that up; for now the bookmark
// star is the primary action.

function AgentCard({ agent }: { agent: DukigenAgent }) {
    const [bookmarked, setBookmarked] = useState<boolean>(() => isBookmarkedFn(agent.agentId))
    const ProductIcon = PRODUCT_ICONS[agent.productType as ProductType]
    const DukiIcon = DUKI_ICONS[agent.dukiType as DukiType]
    const productLabel = PRODUCT_LABELS[agent.productType as ProductType] ?? 'Unknown'
    const dukiTypeLabel = agent.dukiType === 1 ? 'Revenue' : agent.dukiType === 2 ? 'Profit' : '—'

    const onToggle = (e: React.MouseEvent) => {
        // Bookmark click should never bubble to a card-level link.
        e.preventDefault()
        e.stopPropagation()
        setBookmarked(toggleBookmark(agent.agentId))
    }

    return (
        <div
            style={{
                position: 'relative',
                borderRadius: 12, padding: 12,
                border: `1px solid ${BDR}`, background: 'var(--muted)',
                transition: 'border-color 0.15s, transform 0.15s',
            }}
        >
            {/* Bookmark star — absolute top-right so it works in a tight tile */}
            <button
                type="button"
                onClick={onToggle}
                aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this agent'}
                title={bookmarked ? 'Remove bookmark' : 'Bookmark this agent'}
                style={{
                    position: 'absolute', top: 8, right: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, borderRadius: 8,
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    color: bookmarked ? '#f59e0b' : META,
                }}
            >
                <Star size={16} fill={bookmarked ? '#f59e0b' : 'transparent'} />
            </button>

            {/* Identity */}
            <div style={{ paddingRight: 32, marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: FG, lineHeight: 1.2 }}>
                    {agent.name || '(unnamed)'}
                </div>
                <div style={{ fontSize: 10, color: META, marginTop: 2 }}>
                    #{String(agent.agentId)}
                </div>
            </div>

            {/* Spec — productType · dukiType · approxBps */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                <Pill icon={ProductIcon ? <ProductIcon size={10} /> : null} label={productLabel} />
                <Pill icon={DukiIcon ? <DukiIcon size={10} /> : <HeartHandshake size={10} />} label={`${dukiTypeLabel} share`} />
                <Pill icon={<HeartPulse size={10} />} label={`${(agent.approxBps / 100).toFixed(1)}%`} title="Avg DUKI rate" />
            </div>

            {/* Links */}
            {(agent.website || agent.agentUri) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: META }}>
                    {agent.website && (
                        <a
                            href={agent.website}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{ color: 'var(--duki-400)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}
                        >
                            <Globe size={11} className="flex-shrink-0" />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {stripScheme(agent.website)}
                            </span>
                        </a>
                    )}
                    {agent.agentUri && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, fontFamily: 'monospace', fontSize: 10, opacity: 0.8 }}>
                            <FileText size={10} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={agent.agentUri}>
                                {agent.agentUri}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Cross-chain footprint count */}
            {agent.chainContracts && agent.chainContracts.length > 0 && (
                <div style={{
                    marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${BDR}`,
                    fontSize: 10, color: META, display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                    <Network size={11} />
                    Deployed on {agent.chainContracts.length} chain{agent.chainContracts.length === 1 ? '' : 's'}
                </div>
            )}

            {/* Footer: external "view on…" — placeholder for explorer link */}
            {agent.agentUri && (agent.agentUri.startsWith('http') || agent.agentUri.startsWith('ipfs')) && (
                <a
                    href={agent.agentUri.startsWith('ipfs://')
                        ? `https://ipfs.io/ipfs/${agent.agentUri.replace('ipfs://', '')}`
                        : agent.agentUri}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        marginTop: 8, fontSize: 10, color: META,
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        textDecoration: 'none',
                    }}
                >
                    Open agentURI <ExternalLink size={9} />
                </a>
            )}
        </div>
    )
}

// ── Small UI bits ──────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }: {
    active: boolean
    onClick: () => void
    children: React.ReactNode
}) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            onClick={onClick}
            style={{
                padding: '6px 12px', fontSize: 12, fontWeight: 500,
                background: active ? 'var(--muted)' : 'transparent',
                color: active ? FG : META,
                border: 'none', cursor: 'pointer',
                borderRight: `1px solid ${BDR}`,
                transition: 'background 0.15s, color 0.15s',
            }}
        >
            {children}
        </button>
    )
}

function Pill({ icon, label, title }: { icon?: React.ReactNode; label: string; title?: string }) {
    return (
        <span
            title={title}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 500,
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

// ── helpers ────────────────────────────────────────────────────────────────

function stripScheme(url: string): string {
    return url.replace(/^https?:\/\//, '')
}
