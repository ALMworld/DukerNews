import { createFileRoute } from '@tanstack/react-router'
import PostList from '../components/PostList'
import { postsQueryOptions } from '../lib/query-options'
import type { GetPostsInput } from '../services/post-service'

interface SearchParams {
  page?: number
  q?: string
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    page: Number(search.page) || undefined,
    q: (search.q as string) || undefined,
  }),
  loaderDeps: ({ search }) => ({ page: search.page, q: search.q }),
  loader: async ({ deps, context: { queryClient } }) => {
    const input: GetPostsInput = {
      sort: 'points',
      page: deps.page || 1,
      perPage: 64,
      q: deps.q,
    }
    return queryClient.ensureQueryData(postsQueryOptions(input))
  },
  component: HomePage,
})

function HomePage() {
  const { page, q } = Route.useSearch()
  const input: GetPostsInput = {
    sort: 'points',
    page: page || 1,
    perPage: 64,
    q,
  }

  return (
    <PostList
      title="Top"
      input={input}
      page={page}
      q={q}
      basePath="/"
    />
  )
}
