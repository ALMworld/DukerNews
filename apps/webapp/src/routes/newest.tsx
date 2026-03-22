import { createFileRoute } from '@tanstack/react-router'
import PostList from '../components/PostList'
import { postsQueryOptions } from '../lib/query-options'
import type { GetPostsInput } from '../services/post-service'

interface SearchParams {
    page?: number
    q?: string
    /** Cursor-based: last post ID */
    next?: number
    /** Cursor-based: starting rank number */
    n?: number
}

export const Route = createFileRoute('/newest')(({
    validateSearch: (search: Record<string, unknown>): SearchParams => ({
        page: Number(search.page) || undefined,
        q: (search.q as string) || undefined,
        next: Number(search.next) || undefined,
        n: Number(search.n) || undefined,
    }),
    loaderDeps: ({ search }) => ({ q: search.q, next: search.next, n: search.n }),
    loader: async ({ deps, context: { queryClient } }) => {
        const input: GetPostsInput = {
            sort: 'newest',
            perPage: 30,
            q: deps.q,
            nextCursor: deps.next || undefined,
        }
        return queryClient.ensureQueryData(postsQueryOptions(input))
    },
    component: NewPage,
}))

function NewPage() {
    const { q, next, n } = Route.useSearch()
    const input: GetPostsInput = {
        sort: 'newest',
        perPage: 30,
        q,
        nextCursor: next || undefined,
    }

    return (
        <PostList
            title="New"
            input={input}
            q={q}
            basePath="/newest"
            emptyMessage="No new posts yet."
            cursorPagination
            nextCursor={next}
            startRank={n}
        />
    )
}
