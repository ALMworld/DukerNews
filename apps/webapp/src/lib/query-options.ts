/**
 * Centralised TanStack Query options factory.
 * Use in route loaders (ensureQueryData) and components (useQuery / useSuspenseQuery)
 * to share the same cache entries.
 */

import { queryOptions } from '@tanstack/react-query'
import { getPosts, getPostAgg } from '../server/posts'
import type { GetPostsInput, PostAggResult } from '../services/post-service'
import type { PbGetPostsResp } from '@repo/apidefs'

// ---------------------------------------------------------------------------
// Posts list (index / new / ask / etc.)
// ---------------------------------------------------------------------------

export const postsQueryOptions = (input: GetPostsInput) =>
    queryOptions<PbGetPostsResp>({
        queryKey: ['posts', input] as const,
        queryFn: () => getPosts({ data: input }),
        staleTime: 60_000, // 1 min — news items don't change that fast
    })

// ---------------------------------------------------------------------------
// Post detail (post + comments aggregated)
// ---------------------------------------------------------------------------

export const postAggQueryOptions = (id: number) =>
    queryOptions<PostAggResult>({
        queryKey: ['post-agg', id] as const,
        queryFn: () => getPostAgg({ data: { id } }),
        staleTime: 30_000, // 30s — comments change more frequently
    })
