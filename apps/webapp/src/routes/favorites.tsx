/**
 * /favorites — per-user favorites view.
 *
 * Three sub-views, selected by the search params:
 *   - default                       → favorite submissions (placeholder)
 *   - ?id=u&comments=t              → favorite comments    (placeholder)
 *   - ?id=u&agents=t                → favorited DUKIGEN agents
 *
 * The agents view reads ids from lib/bookmarks.ts (per-browser localStorage)
 * and fetches each via getDukigenAgent. There's no ranking here — favorites
 * are intentionally browser-local and unranked.
 */
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useBookmarks } from '../lib/bookmarks'
import { getDukigenAgent, type DukigenAgent } from '../client/registry-api'
import { AgentRow } from '../components/AgentRow'

type FavoritesSearch = {
    id?: string
    comments?: string
    agents?: string
}

export const Route = createFileRoute('/favorites')({
    validateSearch: (search: Record<string, unknown>): FavoritesSearch => ({
        id: typeof search.id === 'string' ? search.id : undefined,
        comments: typeof search.comments === 'string' ? search.comments : undefined,
        agents: typeof search.agents === 'string' ? search.agents : undefined,
    }),
    component: FavoritesPage,
})

function FavoritesPage() {
    const { id, comments: showComments, agents: showAgents } = Route.useSearch()

    if (showAgents === 't') {
        return <FavoriteAgentsView userId={id ?? ''} />
    }

    const label = showComments === 't' ? 'favorite comments' : 'favorite submissions'

    if (!id) return <div className="px-3 py-4 text-sm" style={{ color: 'var(--meta-color)' }}>No user specified.</div>

    return (
        <div className="px-3 py-4">
            <h3 className="text-sm mb-3" style={{ color: 'var(--meta-color)' }}>
                <Link to="/user" search={{ id }} className="hover:underline" style={{ color: 'var(--duki-300)' }}>{id}</Link>'s {label}
            </h3>
            <div className="text-sm" style={{ color: 'var(--meta-color)' }}>
                No {label} yet.
            </div>
        </div>
    )
}

function FavoriteAgentsView({ userId }: { userId: string }) {
    const { bookmarks } = useBookmarks()

    const { data: agents, isLoading, error } = useQuery({
        queryKey: ['favorite-agents', bookmarks],
        queryFn: async () => {
            const results = await Promise.all(bookmarks.map((id) => getDukigenAgent(id)))
            return results.filter((a): a is DukigenAgent => a !== null)
        },
        enabled: bookmarks.length > 0,
        staleTime: 30_000,
    })

    return (
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 16px' }}>
            <h3 className="text-sm mb-3" style={{ color: 'var(--meta-color)' }}>
                {userId ? (
                    <>
                        <Link to="/user" search={{ id: userId }} className="hover:underline" style={{ color: 'var(--duki-300)' }}>{userId}</Link>
                        {' '}
                    </>
                ) : null}
                favorited agents <span style={{ opacity: 0.6 }}>({bookmarks.length})</span>
            </h3>

            {bookmarks.length === 0 ? (
                <EmptyState>
                    <span>No favorited agents yet — tap the heart on any agent in the </span>
                    <Link to="/market" style={{ color: 'var(--duki-400)', textDecoration: 'underline' }}>market</Link>
                    <span> to save it here.</span>
                </EmptyState>
            ) : isLoading ? (
                <EmptyState>
                    <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Loading…</span>
                </EmptyState>
            ) : error ? (
                <EmptyState tone="error">Failed to load favorited agents.</EmptyState>
            ) : !agents || agents.length === 0 ? (
                <EmptyState>None of your favorited agents could be found in the registry.</EmptyState>
            ) : (
                <div>
                    {agents.map((a, idx) => (
                        <AgentRow
                            key={String(a.agentId)}
                            agent={a}
                            rank={idx + 1}
                        />
                    ))}
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
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '40px 16px', borderRadius: 12,
                border: '1px dashed var(--border)',
                color: tone === 'error' ? '#ef4444' : 'var(--meta-color)',
                fontSize: 13,
                flexWrap: 'wrap',
            }}
        >
            {children}
        </div>
    )
}
