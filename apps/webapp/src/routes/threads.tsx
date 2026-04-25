import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState, useCallback } from 'react'
import { getUserThreads } from '../server/comments'
import type { PbComment } from '@repo/dukernews-apidefs'
import type { UserThread } from '../services/comment-service'
import CommentThread from '../components/CommentThread'

export const Route = createFileRoute('/threads')({
    validateSearch: (search: Record<string, unknown>) => ({
        id: (search.id as string) || '',
        next: search.next ? Number(search.next) : undefined,
    }),
    component: ThreadsPage,
})

function ThreadsPage() {
    const { id: username, next } = Route.useSearch()
    const [threads, setThreads] = useState<UserThread[]>([])
    const [loading, setLoading] = useState(true)
    const [hasMore, setHasMore] = useState(false)
    const [nextCursor, setNextCursor] = useState<number | null>(null)

    useEffect(() => {
        if (!username) { setLoading(false); return }
        setLoading(true)
        getUserThreads({ data: { identifier: username, next } }).then((result) => {
            setThreads(result.threads)
            setHasMore(result.hasMore)
            setNextCursor(result.nextCursor)
            setLoading(false)
        })
    }, [username, next])

    if (!username) return <div className="px-3 py-4 text-sm" style={{ color: 'var(--meta-color)' }}>No user specified.</div>

    return (
        <div className="py-1">
            {loading ? (
                <div style={{ minHeight: '50vh' }} />
            ) : threads.length === 0 ? (
                <div className="text-center py-12 text-sm" style={{ color: 'var(--meta-color)' }}>
                    No comments yet.
                </div>
            ) : (
                <div>
                    {threads.map((thread, index) => (
                        <ThreadSection
                            key={`${thread.postId}-${thread.comments[0]?.id}`}
                            thread={thread}
                            isFirst={index === 0}
                            onThreadUpdate={(postId, commentId, updater) => {
                                setThreads(prev => prev.map(t => {
                                    if (t.postId === postId && t.comments[0]?.id === commentId) {
                                        return { ...t, comments: updater(t.comments) }
                                    }
                                    return t
                                }))
                            }}
                        />
                    ))}

                    {/* HN-style "More" link for pagination */}
                    {hasMore && nextCursor && (
                        <div className="py-3 px-2">
                            <Link
                                to="/threads"
                                search={{ id: username, next: nextCursor }}
                                className="text-sm no-underline hover:underline"
                                style={{ color: 'var(--link-color)' }}
                            >
                                More
                            </Link>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

/** One thread section = CommentMeta header + CommentThread for descendants */
function ThreadSection({
    thread,
    isFirst,
    onThreadUpdate,
}: {
    thread: UserThread
    isFirst: boolean
    onThreadUpdate: (postId: number, commentId: number, updater: (comments: PbComment[]) => PbComment[]) => void
}) {
    const rootComment = thread.comments[0]
    if (!rootComment) return null

    const handleReplyAdded = useCallback((newComments: PbComment[]) => {
        onThreadUpdate(thread.postId, rootComment.id, prev => {
            const result = [...prev]
            for (const nc of newComments) {
                if (result.some(c => c.id === nc.id)) continue
                const parentIdx = result.findIndex(c => c.id === nc.parentId)
                if (parentIdx >= 0) {
                    result.splice(parentIdx + 1, 0, nc)
                } else {
                    result.push(nc)
                }
            }
            return result
        })
    }, [thread.postId, rootComment.id, onThreadUpdate])

    const handleCommentEdited = useCallback((commentId: number, newText: string) => {
        onThreadUpdate(thread.postId, rootComment.id, prev =>
            prev.map(c => c.id === commentId ? { ...c, text: newText } as unknown as PbComment : c)
        )
    }, [thread.postId, rootComment.id, onThreadUpdate])

    const handleCommentDeleted = useCallback((commentId: number) => {
        onThreadUpdate(thread.postId, rootComment.id, prev => prev.filter(c => c.id !== commentId))
    }, [thread.postId, rootComment.id, onThreadUpdate])

    return (
        <div style={{ paddingTop: isFirst ? '0' : '10px' }}>
            {/* Reuse CommentThread — threadCtx makes root comment show thread-style header */}
            <CommentThread
                comments={thread.comments}
                postId={thread.postId}
                postLocale={thread.postLocale}
                onReplyAdded={handleReplyAdded}
                onCommentEdited={handleCommentEdited}
                onCommentDeleted={handleCommentDeleted}
                threadCtx={{ postId: thread.postId, postTitle: thread.postTitle }}
            />
        </div>
    )
}
