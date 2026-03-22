import { createFileRoute } from '@tanstack/react-router'
import PostList from '../components/PostList'
import { postsQueryOptions } from '../lib/query-options'
import type { GetPostsInput } from '../services/post-service'
import { PostKind } from '@repo/apidefs'

interface SearchParams {
    page?: number
    q?: string
}

export const Route = createFileRoute('/voice')(({
    validateSearch: (search: Record<string, unknown>): SearchParams => ({
        page: Number(search.page) || undefined,
        q: (search.q as string) || undefined,
    }),
    loaderDeps: ({ search }) => ({ page: search.page, q: search.q }),
    loader: async ({ deps, context: { queryClient } }) => {
        const input: GetPostsInput = {
            kind: PostKind.VOICE,
            sort: 'newest',
            page: deps.page || 1,
            perPage: 30,
            q: deps.q,
        }
        return queryClient.ensureQueryData(postsQueryOptions(input))
    },
    component: AskPage,
}))

function AskPage() {
    const { page, q } = Route.useSearch()
    const input: GetPostsInput = {
        kind: PostKind.VOICE,
        sort: 'newest',
        page: page || 1,
        perPage: 30,
        q,
    }

    return (
        <PostList
            title="Ask"
            input={input}
            page={page}
            q={q}
            basePath="/voice"
            emptyMessage="No Ask Duker News posts yet. Be the first to ask!"
        />
    )
}
