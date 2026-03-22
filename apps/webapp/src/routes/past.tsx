import { createFileRoute, Link } from '@tanstack/react-router'
import PostList from '../components/PostList'
import { postsQueryOptions } from '../lib/query-options'
import type { GetPostsInput } from '../services/post-service'

interface SearchParams {
    page?: number
    q?: string
    date?: string
}

export const Route = createFileRoute('/past')(({
    validateSearch: (search: Record<string, unknown>): SearchParams => ({
        page: Number(search.page) || undefined,
        q: (search.q as string) || undefined,
        date: (search.date as string) || undefined,
    }),
    loaderDeps: ({ search }) => ({ page: search.page, q: search.q, date: search.date }),
    loader: async ({ deps, context: { queryClient } }) => {
        const input: GetPostsInput = {
            sort: 'conviction',
            page: deps.page || 1,
            perPage: 30,
            q: deps.q,
        }
        return queryClient.ensureQueryData(postsQueryOptions(input))
    },
    component: PastPage,
}))

/** Get yesterday's date in UTC as YYYY-MM-DD */
function getYesterdayUTC(): string {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
}

/** Parse YYYY-MM-DD string, offset by days/months/years (UTC) */
function offsetDate(
    dateStr: string,
    { days = 0, months = 0, years = 0 }: { days?: number; months?: number; years?: number },
): string {
    const d = new Date(dateStr + 'T00:00:00Z')
    d.setUTCFullYear(d.getUTCFullYear() + years)
    d.setUTCMonth(d.getUTCMonth() + months)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}

/** Format YYYY-MM-DD → "February 25, 2026" */
function formatDateLong(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00Z')
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
    })
}

function PastPage() {
    const { page, q, date } = Route.useSearch()
    const currentDate = date || getYesterdayUTC()
    const input: GetPostsInput = {
        sort: 'conviction',
        page: page || 1,
        perPage: 30,
        q,
    }

    const linkStyle = { color: 'var(--link-color)' }

    return (
        <div>
            {/* Date header with navigation */}
            <div className="px-3 pt-3 pb-1">
                <div className="text-sm" style={{ color: 'var(--foreground)' }}>
                    Stories from {formatDateLong(currentDate)} (UTC)
                </div>
                <div className="text-sm mt-1" style={{ color: 'var(--meta-color)' }}>
                    Go back a{' '}
                    <Link
                        to="/past"
                        search={{ date: offsetDate(currentDate, { days: -1 }) }}
                        className="underline hover:opacity-80"
                        style={linkStyle}
                    >
                        day
                    </Link>
                    ,{' '}
                    <Link
                        to="/past"
                        search={{ date: offsetDate(currentDate, { months: -1 }) }}
                        className="underline hover:opacity-80"
                        style={linkStyle}
                    >
                        month
                    </Link>
                    , or{' '}
                    <Link
                        to="/past"
                        search={{ date: offsetDate(currentDate, { years: -1 }) }}
                        className="underline hover:opacity-80"
                        style={linkStyle}
                    >
                        year
                    </Link>
                    . Go forward a{' '}
                    <Link
                        to="/past"
                        search={{ date: offsetDate(currentDate, { days: 1 }) }}
                        className="underline hover:opacity-80"
                        style={linkStyle}
                    >
                        day
                    </Link>
                    ,{' '}
                    <Link
                        to="/past"
                        search={{ date: offsetDate(currentDate, { months: 1 }) }}
                        className="underline hover:opacity-80"
                        style={linkStyle}
                    >
                        month
                    </Link>
                    , or{' '}
                    <Link
                        to="/past"
                        search={{ date: offsetDate(currentDate, { years: 1 }) }}
                        className="underline hover:opacity-80"
                        style={linkStyle}
                    >
                        year
                    </Link>
                    .
                </div>
            </div>

            <PostList
                title=""
                input={input}
                page={page}
                q={q}
                basePath="/past"
                emptyMessage="No stories found for this date."
            />
        </div>
    )
}
