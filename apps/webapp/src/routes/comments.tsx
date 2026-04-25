import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getRecentComments } from '../server/comments'
import { timeAgo } from '../lib/utils'
import { useLocale } from '../lib/locale-context'
import { renderFormattedText } from '../lib/format-text'
import type { PbComment } from '@repo/dukernews-apidefs'

export const Route = createFileRoute('/comments')({
    component: CommentsPage,
})

function CommentsPage() {
    const [comments, setComments] = useState<PbComment[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        setLoading(true)
        getRecentComments({ data: { limit: 40 } }).then((data) => {
            setComments(data)
            setLoading(false)
        })
    }, [])

    return (
        <div className="py-2">
            {loading ? (
                <div style={{ minHeight: '50vh' }} />
            ) : comments.length === 0 ? (
                <div
                    className="text-center py-12 text-sm"
                    style={{ color: 'var(--meta-color)' }}
                >
                    No comments yet.
                </div>
            ) : (
                <div>
                    {comments.map((comment) => (
                        <RecentCommentItem key={comment.id} comment={comment} />
                    ))}
                </div>
            )}
        </div>
    )
}

function RecentCommentItem({ comment }: { comment: PbComment }) {
    const { locale: userLocale } = useLocale()
    const ago = timeAgo(comment.createdAt, userLocale)

    // Truncate post title for "on:" display
    const truncatedTitle =
        comment.postTitle.length > 80
            ? comment.postTitle.slice(0, 80) + '…'
            : comment.postTitle

    return (
        <div className="py-1.5 px-2">
            {/* HN-style: upvote on left, content on right */}
            <div className="flex gap-1.5">
                {/* Upvote column */}
                <div style={{ paddingTop: '1px' }}>
                    <button
                        className="hover:opacity-80"
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--meta-color)',
                            padding: 0,
                            fontSize: '10px',
                            lineHeight: 1,
                        }}
                        title="Upvote"
                    >
                        ▲
                    </button>
                </div>

                {/* Content column */}
                <div className="flex-1 min-w-0">
                    {/* Meta line: author time | parent | context | on: Post Title */}
                    <div
                        className="text-xs flex-wrap"
                        style={{ color: 'var(--meta-color)', fontSize: '8pt' }}
                    >
                        {/* Author */}
                        {comment.username && (
                            <>
                                <Link to="/user" search={{ id: comment.username }} className="font-semibold no-underline meta-link" style={{ color: 'var(--meta-color)' }}>
                                    {comment.username}
                                </Link>
                                {' '}
                            </>
                        )}

                        {/* Time */}
                        <span>{ago}</span>

                        <span style={{ opacity: 0.4, margin: '0 2px' }}>|</span>

                        {/* Parent link */}
                        {comment.parentId && (
                            <>
                                <Link
                                    to="/post/$id"
                                    params={{ id: String(comment.postId) }}
                                    className="comment-nav-link"
                                >
                                    parent
                                </Link>
                                <span style={{ opacity: 0.4, margin: '0 2px' }}>|</span>
                            </>
                        )}

                        {/* Context link */}
                        <Link
                            to="/post/$id"
                            params={{ id: String(comment.postId) }}
                            className="comment-nav-link"
                        >
                            context
                        </Link>

                        <span style={{ opacity: 0.4, margin: '0 2px' }}>|</span>

                        {/* On: Post title */}
                        <span>on: </span>
                        <Link
                            to="/post/$id"
                            params={{ id: String(comment.postId) }}
                            className="comment-nav-link"
                        >
                            {truncatedTitle}
                        </Link>
                    </div>

                    {/* Comment body — indented under meta, not under upvote */}
                    <div
                        className="text-sm mt-1 leading-relaxed"
                        style={{ color: 'var(--foreground)' }}
                    >
                        {renderFormattedText(comment.text)}
                    </div>
                </div>
            </div>
        </div>
    )
}
