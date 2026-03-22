/**
 * PostItem — renders a post for both list and detail contexts.
 *
 * List mode (rank provided):  rank · ▲ · title + translate · PostMeta
 * Detail mode (no rank):      ▲ · <h1>title + translate</h1> · PostMeta(titleRow)
 *
 * Detail-mode extra props:
 *   translateAllActive / onTranslateAll — wired into PostMeta's Translate All button.
 *   onTranslateToggle(showing) — called whenever the title translate state changes,
 *     so the detail page can also translate the post body text.
 */
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
// import { useChainHandle } from '../client/useChainHandle'  // TODO: re-enable for UPVOTE_POST
import { useInteractions, VOTE_MASK, VOTE_UP } from '../client/useInteractions'
// import { CmdType } from '@repo/apidefs'  // TODO: re-enable for UPVOTE_POST
import { useLocale } from '../lib/locale-context'
import { useRequireAuth } from '../lib/useRequireAuth'
import { translateText, getLocaleName } from '../lib/translate-service'
import { getDisplayText } from '../lib/bagua-text'
import type { PbPost } from '@repo/apidefs'
import { Languages, Undo2 } from 'lucide-react'
import { PostMeta } from './PostMeta'

interface PostItemProps {
    post: PbPost
    /** List mode: show rank number. Omit for detail mode. */
    rank?: number
    /** Detail mode: no rank, title in <h1>, PostMeta gets titleRow layout. */
    detailMode?: boolean
    /** Passed through to PostMeta's Translate All button (detail only). */
    translateAllActive?: boolean
    onTranslateAll?: () => void
    /**
     * Called whenever the title translate state toggles.
     * The detail page uses this to also trigger body text translation.
     */
    onTranslateToggle?: (showing: boolean) => void
}

export default function PostItem({
    post,
    rank,
    detailMode = false,
    translateAllActive,
    onTranslateAll,
    onTranslateToggle,
}: PostItemProps) {
    const [points, setPoints] = useState(post.points)
    const [animating, setAnimating] = useState(false)
    const { locale: userLocale } = useLocale()
    const { requireAuth, me } = useRequireAuth()
    const isOwnPost = !!(me?.ego && post.address === me.ego)

    // IDB-backed interaction state
    const { getBits, updateBits } = useInteractions()
    const currentBits = getBits('post', post.id)
    const voted = (currentBits & VOTE_MASK) === VOTE_UP

    // Translation state (title only — body is handled by the parent in detail mode)
    const [translatedTitle, setTranslatedTitle] = useState<string | null>(null)
    const [translating, setTranslating] = useState(false)
    const [showTranslated, setShowTranslated] = useState(false)

    const needsTranslation = post.locale !== userLocale

    // TODO: migrate to dispatch({ kind: DispatchKind.UPVOTE_POST, ... })
    // const { dispatch } = useDispatchHandle()

    const handleUpvote = async (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (voted) return
        if (!requireAuth()) return
        setAnimating(true)
        setPoints((p) => p + 1)
        // Optimistic: update IDB + cache
        await updateBits('post', post.id, (currentBits & ~VOTE_MASK) | VOTE_UP)
        // TODO: dispatch UPVOTE_POST on-chain when DispatchKind.UPVOTE_POST is implemented
        setTimeout(() => setAnimating(false), 300)
    }

    const handleTranslate = async (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (showTranslated) {
            setShowTranslated(false)
            onTranslateToggle?.(false)
            return
        }
        if (translatedTitle) {
            setShowTranslated(true)
            onTranslateToggle?.(true)
            return
        }
        setTranslating(true)
        const result = await translateText(post.title, post.locale, userLocale)
        setTranslatedTitle(result)
        setShowTranslated(true)
        onTranslateToggle?.(true)
        setTranslating(false)
    }

    const baseTitle = getDisplayText(post.title, userLocale)
    const displayTitle = showTranslated && translatedTitle ? translatedTitle : baseTitle

    // ── Shared title content ──────────────────────────────────────────
    const titleContent = (
        <>
            {post.url ? (
                <a
                    href={post.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`font-medium no-underline ${detailMode ? 'hover:underline' : ''}`}
                    style={{ color: 'var(--foreground)', fontSize: detailMode ? undefined : '10pt' }}
                >
                    {displayTitle}
                </a>
            ) : detailMode ? (
                // text post on detail page — title is not a link (already here)
                <span>{displayTitle}</span>
            ) : (
                <Link
                    to="/post/$id"
                    params={{ id: String(post.id) }}
                    className="font-medium no-underline"
                    style={{ color: 'var(--foreground)', fontSize: '10pt' }}
                >
                    {displayTitle}
                </Link>
            )}

            {/* Domain */}
            {post.domain && (
                <span
                    className={`text-xs ${detailMode ? 'font-normal ml-2' : 'ml-1'}`}
                    style={{ color: 'var(--domain-color)' }}
                >
                    ({post.domain})
                </span>
            )}

            {/* Translate toggle */}
            {needsTranslation && (
                <button
                    onClick={handleTranslate}
                    disabled={translating}
                    className={`meta-link ml-1 inline-flex items-center align-baseline ${detailMode ? '' : ''}`}
                    style={{
                        color: showTranslated ? 'var(--duki-400)' : 'var(--meta-color)',
                        background: 'none',
                        border: 'none',
                        cursor: translating ? 'wait' : 'pointer',
                        padding: 0,
                        fontWeight: 'normal',
                    }}
                    title={showTranslated ? `Show original (${getLocaleName(post.locale)})` : 'Translate'}
                >
                    {translating
                        ? '...'
                        : showTranslated
                            ? <Undo2 size={10} />
                            : <Languages size={10} />}
                </button>
            )}
        </>
    )

    // ── Upvote button ─────────────────────────────────────────────────
    const upvoteBtn = isOwnPost ? (
        <span
            className="shrink-0"
            style={{
                color: 'var(--meta-color)',
                padding: detailMode ? '0' : '3px 4px 0 2px',
                lineHeight: 1,
                fontSize: '10px',
                marginTop: detailMode ? '2px' : undefined,
            }}
        >
            *
        </span>
    ) : (
        <button
            onClick={handleUpvote}
            disabled={voted}
            className={`shrink-0 transition-all ${animating ? 'upvote-animate' : ''}`}
            style={{
                color: voted ? 'var(--upvote-active)' : 'var(--meta-color)',
                background: 'none',
                border: 'none',
                cursor: voted ? 'default' : 'pointer',
                padding: detailMode ? '0' : '3px 4px 0 2px',
                lineHeight: 1,
                fontSize: '10px',
                marginTop: detailMode ? '2px' : undefined,
            }}
            title={voted ? 'Already upvoted' : 'Upvote'}
        >
            ▲
        </button>
    )

    // ── Detail mode layout ────────────────────────────────────────────
    if (detailMode) {
        return (
            <div className="flex items-start gap-1">
                {upvoteBtn}
                <div className="min-w-0 flex-1">
                    <h1 className="text-sm font-bold leading-snug" style={{ color: 'var(--foreground)' }}>
                        {titleContent}
                    </h1>
                    <PostMeta
                        post={post}
                        points={points}
                        titleRow
                        translateAllActive={translateAllActive}
                        onTranslateAll={onTranslateAll}
                    />
                </div>
            </div>
        )
    }

    // ── List mode layout ──────────────────────────────────────────────
    return (
        <article className="post-item flex items-start gap-0.5 py-0.5 group">
            {/* Rank */}
            {rank !== undefined && (
                <span
                    className="w-7 text-right shrink-0 font-medium tabular-nums"
                    style={{ color: 'var(--meta-color)', lineHeight: '1.4' }}
                >
                    {rank}.
                </span>
            )}

            {upvoteBtn}

            {/* Content */}
            <div className="min-w-0 flex-1">
                <div className="leading-snug">
                    {titleContent}
                </div>
                <PostMeta post={post} points={points} />
            </div>
        </article>
    )
}
