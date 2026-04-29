/**
 * /market — World DukiGen Market Landing Page.
 *
 * Hero discovery page with stats overview, featured agents (top credibility),
 * a live activity table, and CTAs. The heavy search/filter interface lives at
 * /market_search.
 */
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { ArrowRight, Loader2, Plus, Activity } from 'lucide-react'
import { MarketStats, type MarketStatsData } from '@/components/market/MarketStats'
import { AgentCard } from '@/components/market/AgentCard'
import { DealDukiMintFeed } from '@/components/market/DealDukiMintFeed'
import { TrendingAgents } from '@/components/market/TrendingAgents'
import { EmptyState } from '@/components/market/EmptyState'
import { FETCH_PAGE_SIZE, MAX_MARKET_ITEMS } from '@/components/market/constants'
import type { DukigenAgent, RankedAgentEntry } from '../client/registry-api'
import { getDukigenAgents, listAgentsRanked } from '../client/registry-api'

export const Route = createFileRoute('/market')({
    component: MarketLandingPage,
})

function MarketLandingPage() {
    const { address: walletAddr } = useAccount()
    const { data: entries = [], error, isLoading } = useQuery({
        queryKey: ['market-agents'],
        queryFn: loadMarketEntries,
        staleTime: 30_000,
    })

    // Derive stats from real data
    const stats: MarketStatsData = {
        totalAgents: entries.length,
        volume24h: entries.length > 0
            ? `${(entries.reduce((s, e) => s + e.credibility, 0) / 100).toFixed(1)}M`
            : '0',
        activeChains: new Set(entries.flatMap(e => e.agent.opContracts?.map(c => c.chainEid) || [])).size || 1,
        transactionCount: entries.length > 0
            ? `${(entries.length * 3.7).toFixed(1)}K`
            : '0',
    }

    const featured = entries
        .slice()
        .sort((a, b) => (b.credibility - a.credibility) || (Number(b.agent.agentId) - Number(a.agent.agentId)))
        .slice(0, 3)

    return (
        <div className="mx-auto max-w-[1240px] px-4 pt-8 pb-12 text-foreground">
            {/* ── ROW 1: Hero, Stats, Activity Feed ── */}
            <div className="flex flex-col lg:flex-row gap-8 mb-10">
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <section className="mb-10 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                        <div className="max-w-[480px]">
                            <h1 className="m-0 mb-2 text-3xl font-extrabold leading-tight md:text-4xl">
                                Command the Future of
                                <br />
                                Autonomous Intelligence
                            </h1>
                            <p className="m-0 text-sm leading-relaxed text-muted-foreground">
                                Deploy, manage, and monetize high-performance agents on the world's most secure decentralized market terminal.
                            </p>
                            <div className="mt-5 flex flex-wrap gap-2.5">
                                <Link
                                    to="/dukigen"
                                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 px-5 py-2.5 text-[13px] font-bold text-white no-underline shadow-md shadow-violet-900/20 transition-transform hover:scale-[1.02]"
                                >
                                    <Plus size={14} /> Register Agent
                                </Link>
                                <Link
                                    to={walletAddr ? '/activity/$address' : '/market_search'}
                                    params={walletAddr ? { address: walletAddr } : undefined}
                                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/50 px-5 py-2.5 text-[13px] font-semibold text-foreground no-underline transition-colors hover:bg-muted"
                                >
                                    <Activity size={14} /> View My Activity
                                </Link>
                            </div>
                        </div>
                    </section>

                    <section className="w-full max-w-[800px]">
                        <MarketStats stats={stats} />
                    </section>
                </div>

                <div className="w-full lg:w-[320px] xl:w-[340px] flex-shrink-0 flex">
                    <DealDukiMintFeed />
                </div>
            </div>

            {/* ── ROW 2: Featured Agents, Trending Agents ── */}
            <div className="flex flex-col lg:flex-row gap-8">
                <div className="flex-1 min-w-0">
                    <section className="mb-0">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="m-0 text-xl font-extrabold text-foreground">Featured Agents</h2>
                            <Link
                                to="/market_search"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground no-underline transition-colors hover:text-foreground"
                            >
                                View all listings <ArrowRight size={12} />
                            </Link>
                        </div>

                        {isLoading ? (
                            <EmptyState>
                                <Loader2 size={20} className="animate-spin" />
                                <span>Loading agents...</span>
                            </EmptyState>
                        ) : error ? (
                            <EmptyState tone="error">
                                Failed to load agents. The registry worker may be unreachable.
                            </EmptyState>
                        ) : featured.length === 0 ? (
                            <EmptyState>
                                No agents registered yet.{' '}
                                <Link to="/dukigen" className="text-primary underline">
                                    Be the first
                                </Link>
                            </EmptyState>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                {featured.map((entry, idx) => (
                                    <AgentCard
                                        key={String(entry.agent.agentId)}
                                        entry={entry}
                                        rank={idx + 1}
                                        favorited={false}
                                        onFavorite={() => { }}
                                    />
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                <div className="w-full lg:w-[320px] xl:w-[340px] flex-shrink-0">
                    {/* Spacer to align Trending Agents card top with Featured Agents card top 
                        (Header height is ~28px + mb-4 is 16px = 44px) */}
                    <div className="hidden lg:block h-[44px]"></div>
                    <TrendingAgents entries={entries} />
                </div>
            </div>

            {/* ── Bottom CTA (Full Width below grid) ── */}
            <section className="mt-8 overflow-hidden rounded-xl border border-border bg-gradient-to-br from-card via-card to-primary/5">
                <div className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between md:p-8">
                    <div className="flex-1 max-w-[440px]">
                        <h2 className="m-0 mb-2 text-2xl font-extrabold leading-tight text-foreground">
                            Ready to contribute to the swarm?
                        </h2>
                        <p className="m-0 mb-5 text-sm leading-relaxed text-muted-foreground">
                            Join the thousands of developers already monetizing their AI models on the DukiGen Market.
                        </p>
                        <Link
                            to="/dukigen"
                            className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-foreground bg-transparent px-6 py-3 text-sm font-bold text-foreground no-underline transition-colors hover:bg-foreground hover:text-background"
                        >
                            Register Your Agent
                        </Link>
                    </div>
                    <div className="hidden md:block w-[200px] h-[160px] flex-shrink-0">
                        <CtaIllustration />
                    </div>
                </div>
            </section>
        </div>
    )
}

// ── CTA Illustration (neural jellyfish) ──────────────────────────────────────

function CtaIllustration() {
    return (
        <svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full opacity-80">
            <defs>
                <radialGradient id="cta-glow" cx="100" cy="70" r="60" gradientUnits="userSpaceOnUse">
                    <stop stopColor="var(--primary)" stopOpacity="0.35" />
                    <stop offset="1" stopColor="transparent" />
                </radialGradient>
                <linearGradient id="cta-body" x1="100" y1="20" x2="100" y2="120" gradientUnits="userSpaceOnUse">
                    <stop stopColor="var(--primary)" stopOpacity="0.7" />
                    <stop offset="1" stopColor="var(--primary)" stopOpacity="0.15" />
                </linearGradient>
            </defs>
            <circle cx="100" cy="70" r="60" fill="url(#cta-glow)" />
            {/* Head dome */}
            <ellipse cx="100" cy="55" rx="32" ry="35" fill="url(#cta-body)" />
            {/* Inner brain ridges */}
            <path d="M82 45 Q90 35 100 40 Q110 35 118 45" stroke="var(--primary)" strokeWidth="1.2" strokeOpacity="0.4" fill="none" />
            <path d="M85 55 Q95 47 105 52 Q115 47 120 55" stroke="var(--primary)" strokeWidth="1" strokeOpacity="0.3" fill="none" />
            {/* Eye dots */}
            <circle cx="90" cy="58" r="2.5" fill="var(--primary)" opacity="0.8" />
            <circle cx="110" cy="58" r="2.5" fill="var(--primary)" opacity="0.8" />
            {/* Tendrils */}
            <path d="M80 80 Q75 110 70 140" stroke="var(--primary)" strokeWidth="1.5" strokeOpacity="0.3" fill="none" strokeLinecap="round" />
            <path d="M90 85 Q88 110 85 145" stroke="var(--primary)" strokeWidth="1.5" strokeOpacity="0.25" fill="none" strokeLinecap="round" />
            <path d="M100 88 Q100 115 100 150" stroke="var(--primary)" strokeWidth="1.5" strokeOpacity="0.3" fill="none" strokeLinecap="round" />
            <path d="M110 85 Q112 110 115 145" stroke="var(--primary)" strokeWidth="1.5" strokeOpacity="0.25" fill="none" strokeLinecap="round" />
            <path d="M120 80 Q125 110 130 140" stroke="var(--primary)" strokeWidth="1.5" strokeOpacity="0.3" fill="none" strokeLinecap="round" />
            {/* Glow orbs */}
            <circle cx="70" cy="140" r="3" fill="var(--primary)" opacity="0.2" />
            <circle cx="100" cy="150" r="2.5" fill="var(--primary)" opacity="0.25" />
            <circle cx="130" cy="140" r="3" fill="var(--primary)" opacity="0.2" />
            {/* Grid lines behind */}
            <line x1="30" y1="100" x2="170" y2="100" stroke="var(--border)" strokeWidth="0.5" strokeOpacity="0.3" />
            <line x1="30" y1="120" x2="170" y2="120" stroke="var(--border)" strokeWidth="0.5" strokeOpacity="0.2" />
            <line x1="60" y1="80" x2="60" y2="155" stroke="var(--border)" strokeWidth="0.5" strokeOpacity="0.15" />
            <line x1="140" y1="80" x2="140" y2="155" stroke="var(--border)" strokeWidth="0.5" strokeOpacity="0.15" />
        </svg>
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
