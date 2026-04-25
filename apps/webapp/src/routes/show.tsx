import { createFileRoute } from '@tanstack/react-router'
import PostList from '../components/PostList'
import { postsQueryOptions } from '../lib/query-options'
import type { GetPostsInput } from '../services/post-service'
import { PostKind } from '@repo/dukernews-apidefs'

interface SearchParams {
    page?: number
    q?: string
    tag?: string
}

export const Route = createFileRoute('/show')(({
    validateSearch: (search: Record<string, unknown>): SearchParams => ({
        page: Number(search.page) || undefined,
        q: (search.q as string) || undefined,
    }),
    loaderDeps: ({ search }) => ({ page: search.page, q: search.q }),
    loader: async ({ deps, context: { queryClient } }) => {
        const input: GetPostsInput = {
            kind: PostKind.WORKS,
            sort: 'newest',
            page: deps.page || 1,
            perPage: 30,
            q: deps.q,
        }
        return queryClient.ensureQueryData(postsQueryOptions(input))
    },
    component: ShowPage,
}))

function ShowPage() {
    const { page, q } = Route.useSearch()
    const input: GetPostsInput = {
        kind: PostKind.WORKS,
        sort: 'newest',
        page: page || 1,
        perPage: 30,
        q,
    }

    return (
        <PostList
            title="Show"
            input={input}
            page={page}
            q={q}
            basePath="/show"
            emptyMessage="No Show Duker News posts yet. Share your project!"
        />
    )
}
