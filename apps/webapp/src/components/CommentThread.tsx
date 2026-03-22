import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useLocale, type SupportedLocale } from '../lib/locale-context'
import type { PbComment } from '@repo/apidefs'
import { translateText, queryKeys } from '../client'
import CommentItem from './CommentItem'
import type { CommentNav, ThreadContext } from './CommentMeta'

// ---------------------------------------------------------------------------
// Utility: build navigation links (prev/next/parent/root) per comment
// ---------------------------------------------------------------------------

function computeNav(comments: PbComment[]): CommentNav[] {
    return comments.map((c, i) => {
        const depth = c.ancestorPath?.length ? c.ancestorPath.split('.').length : 0
        const parentId = c.parentId ?? 0n
        let prevId: bigint | null = null
        for (let j = i - 1; j >= 0; j--) {
            const sib = comments[j]; const sibDepth = sib.ancestorPath?.length ? sib.ancestorPath.split('.').length : 0
            if (sibDepth < depth) break
            if (sibDepth === depth && (sib.parentId ?? 0n) === parentId) { prevId = sib.id; break }
        }
        let nextId: bigint | null = null
        for (let j = i + 1; j < comments.length; j++) {
            const sib = comments[j]; const sibDepth = sib.ancestorPath?.length ? sib.ancestorPath.split('.').length : 0
            if (sibDepth < depth) break
            if (sibDepth === depth && (sib.parentId ?? 0n) === parentId) { nextId = sib.id; break }
        }
        let rootId: bigint | null = null
        if (depth > 1 && c.ancestorPath) {
            const rootSegment = BigInt(c.ancestorPath.split('.')[0])
            if (rootSegment && rootSegment !== c.id && rootSegment !== parentId) rootId = rootSegment
        }
        return { prevId, nextId, parentId, rootId }
    })
}

function computeHasChildren(comments: PbComment[]): Set<bigint> {
    const s = new Set<bigint>()
    for (const c of comments) { if (c.parentId > 0n) s.add(c.parentId) }
    return s
}

function buildVisibleRows(
    comments: PbComment[],
    navs: CommentNav[],
    parentsWithChildren: Set<bigint>,
    collapsedIds: Set<bigint>,
) {
    const rows: Array<{ comment: PbComment; nav: CommentNav; hasChildren: boolean; hiddenCount: number }> = []
    let i = 0
    while (i < comments.length) {
        const c = comments[i]
        const isCollapsed = collapsedIds.has(c.id)
        const depth = c.ancestorPath?.length ? c.ancestorPath.split('.').length : 0
        if (isCollapsed) {
            let j = i + 1
            while (j < comments.length) {
                const dDepth = comments[j].ancestorPath?.length ? comments[j].ancestorPath.split('.').length : 0
                if (dDepth <= depth) break; j++
            }
            rows.push({ comment: c, nav: navs[i], hasChildren: parentsWithChildren.has(c.id), hiddenCount: j - i - 1 })
            i = j
        } else {
            rows.push({ comment: c, nav: navs[i], hasChildren: parentsWithChildren.has(c.id), hiddenCount: 0 })
            i++
        }
    }
    return rows
}

// ---------------------------------------------------------------------------
// CommentThread — state orchestration + infinite scroll
// ---------------------------------------------------------------------------

interface CommentThreadProps {
    comments: PbComment[]
    postId: bigint,
    postLocale: string
    translateAll?: boolean
    hasMore?: boolean
    loadingMore?: boolean
    onLoadMore?: () => void
    onReplyAdded: (comments: PbComment[]) => void
    onCommentEdited: (commentId: bigint, newText: string) => void
    onCommentDeleted: (commentId: bigint) => void
    /** Thread context for threads page — applied to root comment only */
    threadCtx?: ThreadContext
}

export default function CommentThread({
    comments,
    postId,
    postLocale,
    translateAll = false,
    hasMore,
    loadingMore,
    onLoadMore,
    onReplyAdded,
    onCommentEdited,
    onCommentDeleted,
    threadCtx,
}: CommentThreadProps) {
    const listRef = useRef<HTMLDivElement>(null)
    const sentinelRef = useRef<HTMLDivElement>(null)
    const { locale: userLocale } = useLocale()

    // Collapse state
    const [collapsedIds, setCollapsedIds] = useState<Set<bigint>>(new Set())
    const toggleCollapse = useCallback((id: bigint) => {
        setCollapsedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
    }, [])

    // Manual translate enables
    const [manualEnabled, setManualEnabled] = useState<Set<bigint>>(new Set())
    const enableTranslation = useCallback((id: bigint) => {
        setManualEnabled(prev => prev.has(id) ? prev : new Set([...prev, id]))
    }, [])

    const navs = useMemo(() => computeNav(comments), [comments])
    const parentsWithChildren = useMemo(() => computeHasChildren(comments), [comments])
    const visibleRows = useMemo(
        () => buildVisibleRows(comments, navs, parentsWithChildren, collapsedIds),
        [comments, navs, parentsWithChildren, collapsedIds],
    )

    // All visible comment IDs — without virtualizer, all rows are rendered
    const visibleCommentIds = useMemo(
        () => new Set(visibleRows.map(r => r.comment.id)),
        [visibleRows]
    )

    // TanStack Query: one query per row, enabled only when needed
    const translationQueries = useQueries({
        queries: visibleRows.map(r => {
            const commentLocale = (r.comment.locale || postLocale) as SupportedLocale
            const needsTranslation = commentLocale !== userLocale
            const shouldFetch = needsTranslation && (
                (translateAll && visibleCommentIds.has(r.comment.id)) ||
                manualEnabled.has(r.comment.id)
            )
            return {
                queryKey: queryKeys.commentTranslation(r.comment.id, userLocale),
                queryFn: () => translateText(r.comment.text, commentLocale, userLocale),
                enabled: shouldFetch,
                staleTime: Infinity,
                gcTime: 10 * 60_000,
            }
        }),
    })

    // Build commentId → translated text lookup
    const translationMap = useMemo(() => {
        const map = new Map<bigint, string>()
        visibleRows.forEach((r, i) => {
            const q = translationQueries[i]
            if (q?.data) map.set(r.comment.id, q.data)
        })
        return map
    }, [translationQueries, visibleRows])

    // Infinite scroll via IntersectionObserver on a sentinel div
    useEffect(() => {
        const sentinel = sentinelRef.current
        if (!sentinel || !hasMore || !onLoadMore) return
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting && !loadingMore) onLoadMore() },
            { rootMargin: '800px' }
        )
        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [hasMore, loadingMore, onLoadMore])

    if (comments.length === 0) return null

    // When in threads page, offset all depths relative to root comment
    const rootDepthOffset = threadCtx && comments[0]?.ancestorPath
        ? (comments[0].ancestorPath.length ? comments[0].ancestorPath.split('.').length : 0)
        : 0

    return (
        <div ref={listRef}>
            {visibleRows.map((row, qi) => {
                const translatedText = translationMap.get(row.comment.id) ?? null
                const isTranslating = translationQueries[qi]?.isFetching ?? false
                return (
                    <CommentItem
                        key={row.comment.id}
                        comment={row.comment}
                        postId={postId}
                        postLocale={postLocale}
                        nav={row.nav}
                        hasChildren={row.hasChildren}
                        collapsed={collapsedIds.has(row.comment.id)}
                        hiddenCount={row.hiddenCount}
                        translatedText={translatedText}
                        isTranslating={isTranslating}
                        onRequestTranslation={() => enableTranslation(row.comment.id)}
                        translateAll={translateAll}
                        onToggleCollapse={toggleCollapse}
                        onReplyAdded={onReplyAdded}
                        onCommentEdited={onCommentEdited}
                        onCommentDeleted={onCommentDeleted}
                        threadCtx={qi === 0 ? threadCtx : undefined}
                        depthOffset={rootDepthOffset}
                    />
                )
            })}

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="py-4 text-center text-xs" style={{ color: 'var(--meta-color)' }}>
                {loadingMore ? 'Loading more comments...' : ''}
            </div>
        </div>
    )
}
