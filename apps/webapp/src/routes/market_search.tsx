/**
 * /market_search — DukiGen Agent Search & Browse.
 *
 * Full search/filter interface with paginated agent grid, sort/filter
 * dropdowns, active filter tags, and numbered pagination.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
    Loader2,
    RotateCcw,
    Search,
    SlidersHorizontal,
    X,
} from 'lucide-react'
import { useBookmarks } from '../lib/bookmarks'
import { AgentCard } from '@/components/market/AgentCard'
import { EmptyState } from '@/components/market/EmptyState'
import { PaginationControls } from '@/components/market/PaginationControls'
import { MARKET_PAGE_SIZE, MAX_MARKET_PAGES, FETCH_PAGE_SIZE, MAX_MARKET_ITEMS } from '@/components/market/constants'
import type { DukigenAgent, RankedAgentEntry } from '../client/registry-api'
import { getDukigenAgents, listAgentsRanked } from '../client/registry-api'

export type MarketSort = 'cred_desc' | 'cred_asc' | 'created_desc' | 'created_asc'
type ProductFilter = 'all' | '1' | '2' | '3'
type DukiFilter = 'all' | '1' | '2'

type MarketSearch = {
    sort?: MarketSort
    q?: string
    product?: ProductFilter
    duki?: DukiFilter
    page?: number
}

export const Route = createFileRoute('/market_search')({
    validateSearch: (search: Record<string, unknown>): MarketSearch => ({
        sort: isMarketSort(search.sort) ? search.sort : undefined,
        q: typeof search.q === 'string' ? search.q : undefined,
        product: isProductFilter(search.product) ? search.product : undefined,
        duki: isDukiFilter(search.duki) ? search.duki : undefined,
        page: clampPage(search.page),
    }),
    component: MarketSearchPage,
})

const SORT_OPTIONS: Array<{ value: MarketSort; label: string }> = [
    { value: 'cred_desc', label: 'Credibility Score' },
    { value: 'cred_asc', label: 'Credibility (Low→High)' },
    { value: 'created_desc', label: 'Newest First' },
    { value: 'created_asc', label: 'Oldest First' },
]

const PRODUCT_OPTIONS: Array<{ value: ProductFilter; label: string }> = [
    { value: 'all', label: 'All Types' },
    { value: '1', label: 'Digital' },
    { value: '2', label: 'Physical' },
    { value: '3', label: 'Service' },
]

const DUKI_OPTIONS: Array<{ value: DukiFilter; label: string }> = [
    { value: 'all', label: 'All Metrics' },
    { value: '1', label: 'Revenue' },
    { value: '2', label: 'Profit' },
]

function MarketSearchPage() {
    const params = Route.useSearch()
    const [sort, setSort] = useState<MarketSort>(params.sort ?? 'cred_desc')
    const [search, setSearch] = useState(params.q ?? '')
    const [product, setProduct] = useState<ProductFilter>(params.product ?? 'all')
    const [duki, setDuki] = useState<DukiFilter>(params.duki ?? 'all')
    const [page, setPage] = useState(params.page ?? 1)
    const { bookmarks, toggle } = useBookmarks()

    const { data: entries = [], error, isLoading } = useQuery({
        queryKey: ['market-agents'],
        queryFn: loadMarketEntries,
        staleTime: 30_000,
    })

    useEffect(() => {
        setPage(1)
    }, [sort, search, product, duki])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()

        return entries
            .filter(({ agent }) => {
                if (product !== 'all' && String(agent.productType) !== product) return false
                if (duki !== 'all' && String(agent.dukiType) !== duki) return false
                if (!q) return true
                return searchableText(agent).includes(q)
            })
            .slice()
            .sort((a, b) => compareEntries(a, b, sort))
    }, [entries, search, product, duki, sort])

    const totalPages = Math.max(1, Math.min(MAX_MARKET_PAGES, Math.ceil(filtered.length / MARKET_PAGE_SIZE)))
    const currentPage = Math.min(page, totalPages)
    const pageStart = (currentPage - 1) * MARKET_PAGE_SIZE
    const paged = filtered.slice(pageStart, pageStart + MARKET_PAGE_SIZE)

    const hasSearch = search.trim().length > 0
    const filtersActive = product !== 'all' || duki !== 'all'

    const activeFilters: Array<{ key: string; label: string; onClear: () => void }> = []
    if (product !== 'all') {
        const label = PRODUCT_OPTIONS.find(o => o.value === product)?.label ?? product
        activeFilters.push({ key: 'product', label: `Type: ${label}`, onClear: () => setProduct('all') })
    }
    if (duki !== 'all') {
        const label = DUKI_OPTIONS.find(o => o.value === duki)?.label ?? duki
        activeFilters.push({ key: 'duki', label: `Metric: ${label}`, onClear: () => setDuki('all') })
    }

    const resetFilters = () => {
        setSearch('')
        setProduct('all')
        setDuki('all')
        setPage(1)
    }

    const updatedAgo = entries.length > 0 ? 'UPDATED 2M AGO' : ''

    return (
        <div className="mx-auto max-w-[1180px] px-4 pt-6 pb-10 text-foreground">
            {/* ── Search Bar ── */}
            <section className="mb-5 rounded-xl border border-border bg-card/40 p-4 backdrop-blur-sm">
                <div className="flex gap-2.5">
                    <div className="relative flex-1">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by agent ID, capability, or creator..."
                            className="w-full box-border rounded-lg border border-border bg-input py-3 pr-4 pl-10 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                        />
                    </div>
                    <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-4 py-2 text-xs font-semibold text-foreground cursor-pointer transition-colors hover:bg-muted"
                    >
                        <SlidersHorizontal size={14} /> Advanced
                    </button>
                    <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2 text-xs font-bold text-primary-foreground cursor-pointer transition-transform hover:scale-[1.02]"
                    >
                        Search
                    </button>
                </div>
            </section>

            {/* ── Results Header ── */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <h1 className="m-0 text-lg font-extrabold">
                        {isLoading ? 'Loading...' : `${filtered.length.toLocaleString()} agents found`}
                    </h1>
                    {updatedAgo && (
                        <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                            {updatedAgo}
                        </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <FilterSelect
                        label="Sort"
                        value={sort}
                        options={SORT_OPTIONS}
                        onChange={(v) => setSort(v as MarketSort)}
                    />
                    <FilterSelect
                        label="Type"
                        value={product}
                        options={PRODUCT_OPTIONS}
                        onChange={(v) => setProduct(v as ProductFilter)}
                    />
                    <FilterSelect
                        label="Metric"
                        value={duki}
                        options={DUKI_OPTIONS}
                        onChange={(v) => setDuki(v as DukiFilter)}
                    />
                </div>
            </div>

            {/* ── Active Filter Tags ── */}
            {activeFilters.length > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active Filters:</span>
                    {activeFilters.map((f) => (
                        <span
                            key={f.key}
                            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary"
                        >
                            {f.label}
                            <button
                                type="button"
                                onClick={f.onClear}
                                className="inline-flex cursor-pointer bg-transparent border-none p-0 text-primary/60 transition-colors hover:text-primary"
                                aria-label={`Remove ${f.label}`}
                            >
                                <X size={12} />
                            </button>
                        </span>
                    ))}
                    <button
                        type="button"
                        onClick={resetFilters}
                        className="bg-transparent border-none p-0 text-[11px] text-muted-foreground cursor-pointer transition-colors hover:text-foreground"
                    >
                        Clear all
                    </button>
                </div>
            )}

            {/* ── Agent Grid ── */}
            {isLoading ? (
                <EmptyState>
                    <Loader2 size={20} className="animate-spin" />
                    <span>Loading agents...</span>
                </EmptyState>
            ) : error ? (
                <EmptyState tone="error">Failed to load agents. The registry worker may be unreachable.</EmptyState>
            ) : filtered.length === 0 ? (
                <EmptyState>
                    {hasSearch || filtersActive
                        ? `No agents match "${search || 'current filters'}".`
                        : 'No agents registered yet.'}
                    {(hasSearch || filtersActive) && (
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="ml-2 inline-flex items-center gap-1 text-primary cursor-pointer bg-transparent border-none text-xs underline"
                        >
                            <RotateCcw size={12} /> Reset
                        </button>
                    )}
                </EmptyState>
            ) : (
                <>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
                        {paged.map((entry, idx) => (
                            <AgentCard
                                key={String(entry.agent.agentId)}
                                entry={entry}
                                rank={pageStart + idx + 1}
                                favorited={bookmarks.includes(String(entry.agent.agentId))}
                                onFavorite={() => toggle(entry.agent.agentId)}
                            />
                        ))}
                    </div>
                    <PaginationControls
                        page={currentPage}
                        totalPages={totalPages}
                        totalItems={filtered.length}
                        onPageChange={setPage}
                    />
                </>
            )}
        </div>
    )
}

// ── FilterSelect ──────────────────────────────────────────────────────────────

function FilterSelect<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string
    value: T
    options: Array<{ value: T; label: string }>
    onChange: (value: T) => void
}) {
    return (
        <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-muted-foreground">{label}:</span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value as T)}
                className="h-8 rounded-lg border border-border bg-input px-2.5 text-xs font-semibold text-foreground outline-none cursor-pointer"
            >
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        </div>
    )
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadMarketEntries(): Promise<Array<RankedAgentEntry>> {
    const agents: Array<DukigenAgent> = []
    let total = Number.POSITIVE_INFINITY
    let page = 1

    while (agents.length < Math.min(total, MAX_MARKET_ITEMS)) {
        const resp = await getDukigenAgents({ page, perPage: FETCH_PAGE_SIZE })
        total = resp.total
        agents.push(...resp.agents)
        if (resp.agents.length === 0 || agents.length >= total) break
        page += 1
    }

    const credibility = new Map<string, number>()
    try {
        let cursor = ''
        let rankedLoaded = 0
        do {
            const resp = await listAgentsRanked('all', cursor, FETCH_PAGE_SIZE)
            for (const item of resp.items) {
                credibility.set(String(item.agent.agentId), item.credibility)
            }
            rankedLoaded += resp.items.length
            cursor = resp.hasMore ? resp.nextCursor : ''
        } while (cursor && rankedLoaded < MAX_MARKET_ITEMS)
    } catch {
        // ListAgentsRanked may 500 — degrade gracefully with zero credibility
    }

    return agents.slice(0, MAX_MARKET_ITEMS).map((agent) => ({
        agent,
        credibility: credibility.get(String(agent.agentId)) ?? 0,
    }))
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function compareEntries(a: RankedAgentEntry, b: RankedAgentEntry, sort: MarketSort): number {
    const aId = Number(a.agent.agentId)
    const bId = Number(b.agent.agentId)
    if (sort === 'created_asc') return aId - bId
    if (sort === 'created_desc') return bId - aId
    if (sort === 'cred_asc') return (a.credibility - b.credibility) || (aId - bId)
    return (b.credibility - a.credibility) || (bId - aId)
}

function searchableText(agent: DukigenAgent): string {
    const productLabel = agent.productType === 1 ? 'Digital' : agent.productType === 2 ? 'Physical' : agent.productType === 3 ? 'Service' : ''
    const dukiLabel = agent.dukiType === 1 ? 'revenue' : agent.dukiType === 2 ? 'profit' : ''
    return [
        agent.name,
        String(agent.agentId),
        agent.agentUri,
        agent.agentUriHash,
        agent.website,
        agent.owner,
        agent.agentWallet,
        productLabel,
        dukiLabel,
    ].join(' ').toLowerCase()
}

function clampPage(value: unknown): number | undefined {
    const n = Number(value)
    if (!Number.isFinite(n)) return undefined
    return Math.max(1, Math.min(64, Math.floor(n)))
}

function isMarketSort(value: unknown): value is MarketSort {
    return typeof value === 'string' && SORT_OPTIONS.some((opt) => opt.value === value)
}

function isProductFilter(value: unknown): value is ProductFilter {
    return value === 'all' || value === '1' || value === '2' || value === '3'
}

function isDukiFilter(value: unknown): value is DukiFilter {
    return value === 'all' || value === '1' || value === '2'
}
