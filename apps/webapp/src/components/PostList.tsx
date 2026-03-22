import { Link, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { postsQueryOptions } from '../lib/query-options'
import type { PbPost } from '@repo/apidefs'
import { PostKind } from '@repo/apidefs'
import type { GetPostsInput } from '../services/post-service'
import PostItem from './PostItem'

interface PostListProps {
  title: string
  /** Query input — drives the TanStack Query cache key + fetch */
  input: GetPostsInput
  q?: string
  page?: number
  /** Starting rank number (for cursor-based pagination) */
  startRank?: number
  /** Cursor: start after this post ID */
  nextCursor?: number
  emptyMessage?: string
  /** Base path for pagination links, e.g. '/newest' */
  basePath: string
  /** Additional search params to preserve */
  baseSearch?: Record<string, string | undefined>
  /** Use cursor-based pagination instead of page-based */
  cursorPagination?: boolean
}

export default function PostList({
  input,
  q,
  page,
  startRank,
  nextCursor: nextCursorProp,
  emptyMessage,
  basePath,
  baseSearch = {},
  cursorPagination = false,
}: PostListProps) {
  const navigate = useNavigate()
  const { data } = useSuspenseQuery(postsQueryOptions(input))

  const posts = data.posts as PbPost[]
  const total = data.total
  const nextCursor = data.nextCursor

  const currentPage = page || 1
  const perPage = input.perPage || 64
  const rankStart = startRank || (currentPage - 1) * perPage + 1

  return (
    <div className="py-2">

      {/* Search clear */}
      {q && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm" style={{ color: 'var(--duki-200)' }}>
            Search: "{q}"
          </span>
          <button
            onClick={() => navigate({ to: basePath as any })}
            className="text-xs px-2 py-0.5 rounded transition-opacity hover:opacity-80"
            style={{
              color: 'var(--link-color)',
              background: 'var(--duki-800)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            ✕ Clear
          </button>
        </div>
      )}

      {/* Post list */}
      {posts.length === 0 ? (
        <div
          className="text-center py-12 text-sm"
          style={{ color: 'var(--meta-color)' }}
        >
          {q ? `No posts matching "${q}"` : emptyMessage || 'No posts yet.'}
        </div>
      ) : (
        <>
          <div>
            {posts.map((post, i) => (
              <PostItem
                key={post.id}
                post={post}
                rank={rankStart + i}
              />
            ))}
          </div>

          {/* HN-style "More" link */}
          {cursorPagination ? (
            /* Cursor-based: /newest?next=ID&n=rank */
            nextCursor != null && nextCursor > 0 && (
              <div className="py-3 pl-10">
                <Link
                  to={basePath as any}
                  search={{
                    ...baseSearch,
                    next: nextCursor,
                    n: rankStart + posts.length,
                    q,
                  } as any}
                  className="text-sm font-bold no-underline hover:underline"
                  style={{ color: 'var(--link-color)' }}
                >
                  More
                </Link>
              </div>
            )
          ) : (
            /* Page-based: /?page=2 */
            currentPage < Math.ceil(total / perPage) && (
              <div className="py-3 pl-10">
                <Link
                  to={basePath as any}
                  search={{
                    ...baseSearch,
                    page: currentPage + 1,
                    q,
                  } as any}
                  className="text-sm font-bold no-underline hover:underline"
                  style={{ color: 'var(--link-color)' }}
                >
                  More
                </Link>
              </div>
            )
          )}
        </>
      )}
    </div>
  )
}
