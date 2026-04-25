/**
 * CommentMeta — Shared meta line for comments.
 *
 * Used in two contexts:
 *   1. Post detail (CommentItem): author · time · prev/next/parent/root · [±]
 *   2. Threads page (ThreadSection): points · author · time · parent · context · on: TITLE
 *
 * The component renders a unified HN-style meta line and accepts optional
 * "thread" props (points, postId, postTitle) for the threads context.
 */

import { Link } from '@tanstack/react-router'
import { timeAgo } from '../lib/utils'
import { useLocale } from '../lib/locale-context'
import type { PbComment } from '@repo/dukernews-apidefs'

/** Navigation info computed from sibling/parent context (post detail view) */
export interface CommentNav {
    prevId: bigint | null
    nextId: bigint | null
    parentId: bigint
    rootId: bigint | null
}

/** Thread-specific context (threads page view) */
export interface ThreadContext {
    postId: bigint
    postTitle: string
}

export interface CommentMetaProps {
    comment: PbComment
    /** In-post navigation (prev/next/parent/root). Omit for threads page. */
    nav?: CommentNav
    /** Thread page context (points, post title). Omit for post detail page. */
    threadCtx?: ThreadContext
    /** Collapse state & handler (post detail only) */
    collapsed?: boolean
    hiddenCount?: number
    onToggleCollapse?: (id: bigint) => void
}

const sep = <span style={{ opacity: 0.4, margin: '0 2px' }}>|</span>

export default function CommentMeta({
    comment,
    nav,
    threadCtx,
    collapsed,
    hiddenCount = 0,
    onToggleCollapse,
}: CommentMetaProps) {
    const { locale: userLocale } = useLocale()
    const ago = timeAgo(comment.createdAt, userLocale)
    const authorDisplay = comment.username

    const collapseLabel = collapsed
        ? hiddenCount > 0 ? `[${hiddenCount} more]` : '[+]'
        : '[–]'

    return (
        <div
            className="flex items-center gap-1 flex-wrap"
            style={{ color: 'var(--meta-color)', fontSize: '8pt', lineHeight: '14px' }}
        >
            {/* Points — threads page only */}
            {threadCtx && (
                <span style={{ color: 'var(--meta-color)' }}>{comment.points ?? 1} point{(comment.points ?? 1) !== 1 ? 's' : ''} by </span>
            )}

            {/* Author */}
            <Link
                to="/user"
                search={{ id: authorDisplay }}
                className="font-semibold no-underline meta-link"
                style={{ color: 'var(--meta-color)' }}
            >
                {authorDisplay}
            </Link>

            {/* Time */}
            <span>{ago}</span>

            {/* In-post navigation: prev / next / parent / root */}
            {nav && (
                <>
                    {nav.prevId != null && (<>{sep}<a href={`#${nav.prevId}`} className="comment-nav-link">prev</a></>)}
                    {nav.nextId != null && (<>{sep}<a href={`#${nav.nextId}`} className="comment-nav-link">next</a></>)}
                    {nav.parentId > 0n && (<>{sep}<a href={`#${nav.parentId}`} className="comment-nav-link">parent</a></>)}
                    {nav.rootId != null && (<>{sep}<a href={`#${nav.rootId}`} className="comment-nav-link">root</a></>)}
                </>
            )}

            {/* Thread nav: parent / context / on: TITLE */}
            {threadCtx && (
                <>
                    {comment.parentId > 0n && (
                        <>
                            {sep}
                            <Link
                                to="/post/$id"
                                params={{ id: String(threadCtx.postId) }}
                                className="comment-nav-link"
                            >
                                parent
                            </Link>
                        </>
                    )}
                    {sep}
                    <Link
                        to="/post/$id"
                        params={{ id: String(threadCtx.postId) }}
                        hash={`${comment.id}`}
                        className="comment-nav-link"
                    >
                        context
                    </Link>
                    {sep}
                    <span>on: </span>
                    <Link
                        to="/post/$id"
                        params={{ id: String(threadCtx.postId) }}
                        className="comment-nav-link"
                    >
                        {threadCtx.postTitle.length > 80
                            ? threadCtx.postTitle.slice(0, 80) + '…'
                            : threadCtx.postTitle}
                    </Link>
                </>
            )}

            {/* Collapse toggle — post detail only */}
            {onToggleCollapse && (
                <button
                    onClick={() => onToggleCollapse(comment.id)}
                    className="comment-nav-link"
                    title={collapsed ? 'Expand thread' : 'Collapse thread'}
                >
                    {collapseLabel}
                </button>
            )}
        </div>
    )
}
