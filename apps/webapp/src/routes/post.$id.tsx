import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { create } from '@bufbuild/protobuf'
import { postAggQueryOptions } from '../lib/query-options'
import { getComments as fetchComments } from '../server/comments'
import { useLocale, type SupportedLocale } from '../lib/locale-context'
import type { PbPost, PbComment } from '@repo/dukernews-apidefs'
import { applyCommentEvents } from '../lib/apply-events'
import {
    EventType,
    AggType,
    DukerTxReqSchema,
    EventDataSchema,
    CommentCreatedPayloadSchema,
} from '@repo/dukernews-apidefs'
import CommentThread from '../components/CommentThread'
import CommentLocaleToggle, { getCommentLocaleConfig } from '../components/CommentLocaleToggle'
import { useRequireAuth } from '../lib/useRequireAuth'
import { useChainHandle } from '../client/useChainHandle'
import PostItem from '../components/PostItem'
import { BoostPanel } from '../components/BoostPanel'
import { SubmitOnChainButton } from '../components/SubmitOnChainButton'
import { InteractionBar } from '../components/InteractionBar'
import { translateText } from '../client'
import { getDisplayText } from '../lib/bagua-text'

export const Route = createFileRoute('/post/$id')({
    loader: async ({ params, context: { queryClient } }) => {
        return queryClient.ensureQueryData(postAggQueryOptions(Number(params.id)))
    },
    component: PostDetailPage,
})

function PostDetailPage() {
    const { id } = Route.useParams()
    const loaderData = Route.useLoaderData()
    const { locale: userLocale } = useLocale()
    const { requireAuth, me } = useRequireAuth()
    const { dispatch, step, error: chainError, reset: resetChain } = useChainHandle()
    const cmdPending = step !== 'idle' && step !== 'done'
    const [post, setPost] = useState<PbPost | null>(loaderData.post)
    const [comments, setComments] = useState<PbComment[]>(loaderData.comments)
    const [hasMore, setHasMore] = useState(loaderData.hasMore)
    const [loadingMore, setLoadingMore] = useState(false)
    const [commentText, setCommentText] = useState('')
    const [commentLocale, setCommentLocale] = useState<SupportedLocale>(userLocale)

    // Boost panel state — mutually exclusive with comment form
    const [showBoost, setShowBoost] = useState(false)
    const [showCommentForm, setShowCommentForm] = useState(true)

    const handleToggleBoost = () => {
        const next = !showBoost
        setShowBoost(next)
        setShowCommentForm(!next)  // hide comment form when boost opens
    }

    const handleToggleReply = () => {
        const next = !showCommentForm
        setShowCommentForm(next)
        setShowBoost(!next ? false : showBoost)  // close boost if opening reply
        if (next) setShowBoost(false)
    }

    // Body text translation — PostItem handles title translation internally
    // and calls onTranslateToggle so we can fetch+show body translation in sync.
    const [translatedText, setTranslatedText] = useState<string | null>(null)
    const [showTranslated, setShowTranslated] = useState(false)

    // Translate-all-comments state
    const [translateAllActive, setTranslateAllActive] = useState(false)

    const loadMore = async () => {
        setLoadingMore(true)
        const result = await fetchComments({
            data: { postId: Number(id), offset: comments.length },
        })
        setComments(prev => [...prev, ...result.comments])
        setHasMore(result.hasMore)
        setLoadingMore(false)
    }

    const handleSubmitComment = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!commentText.trim() || !post || cmdPending) return
        if (!requireAuth()) return
        try {
            const txData = create(DukerTxReqSchema, {
                address: me?.ego ?? '',
                aggType: AggType.COMMENT,
                aggId: 0n,  // contract auto-assigns
                evtType: EventType.COMMENT_CREATED,
                data: create(EventDataSchema, {
                    payload: {
                        case: 'commentCreated',
                        value: create(CommentCreatedPayloadSchema, {
                            postId: BigInt(Number(post.id)),
                            parentId: 0n,  // top-level comment — no parent
                            text: commentText.trim(),
                            locale: commentLocale,
                            ancestorPath: '',
                            boostAmount: 0n,  // always free; boost via dedicated action
                        }),
                    },
                }),
            })
            const result = await dispatch(txData, false)  // direct chain — free op

            if (result.events?.length) {
                setComments(prev => applyCommentEvents(prev, result.events!))
            }

            setCommentText('')
            resetChain()
        } catch {
            // Error shown via chainError state
        }
    }

    /**
     * Called by PostItem when its title translate toggle fires.
     * We use this signal to also translate (or hide) the body text.
     */
    const handleTranslateToggle = async (showing: boolean) => {
        setShowTranslated(showing)
        if (showing && post?.text && !translatedText) {
            const t = await translateText(post.text, post.locale, userLocale)
            setTranslatedText(t)
        }
    }

    if (!post) {
        return (
            <div className="px-3 py-6 text-center">
                <p style={{ color: 'var(--meta-color)' }}>Post not found.</p>
                <Link
                    to="/"
                    className="text-sm mt-2 inline-block no-underline"
                    style={{ color: 'var(--link-color)' }}
                >
                    ← Back to Duker News
                </Link>
            </div>
        )
    }

    const baseText = post.text ? getDisplayText(post.text, userLocale) : post.text
    const displayText = showTranslated && translatedText ? translatedText : baseText

    return (
        <div className="px-2 pt-2 pb-1">
            {/* Post header — reuses PostItem in detailMode */}
            <div className="mb-2">
                <PostItem
                    post={post}
                    detailMode
                    translateAllActive={translateAllActive}
                    onTranslateAll={() => setTranslateAllActive(v => !v)}
                    onTranslateToggle={handleTranslateToggle}
                    activeAction={showCommentForm ? 'reply' : showBoost ? 'boost' : 'none'}
                    onReply={handleToggleReply}
                    onBoost={handleToggleBoost}
                    onBoostSuccess={(delta) => {
                        setPost(p => p ? { ...p, totalBoost: (p.totalBoost ?? 0) + BigInt(delta) } as PbPost : p)
                    }}
                />

                {/* Post body text (text posts only) */}
                {(displayText || post.text) && (
                    <div
                        className="mt-1 text-sm leading-normal"
                        style={{ color: 'var(--foreground)', paddingLeft: '18px', whiteSpace: 'pre-wrap' }}
                    >
                        {displayText || post.text}
                    </div>
                )}

                {/* Reply / Boost actions — below body text */}
                <div className="mt-2" style={{ paddingLeft: '18px', fontSize: '8pt', color: 'var(--meta-color)' }}>
                    <InteractionBar
                        activeAction={showCommentForm ? 'reply' : showBoost ? 'boost' : 'none'}
                        exclusive
                        onReply={handleToggleReply}
                        onBoost={handleToggleBoost}
                    />
                </div>
            </div>

            {/* Boost panel — hidden via display when not active */}
            <div style={{ display: showBoost ? undefined : 'none' }} className="mb-3 max-w-md pl-[18px]">
                <BoostPanel
                    aggType={AggType.POST}
                    aggId={post.id}
                    amounts={[1, 2, 8, 20, 100]}
                    defaultAmount={2}
                    subLabel="support this post"
                    onSuccess={(micro) => {
                        setPost(p => p ? { ...p, totalBoost: (p.totalBoost ?? 0) + BigInt(micro) } as PbPost : p)
                    }}
                    onCancel={() => { setShowBoost(false); setShowCommentForm(true) }}
                />
            </div>

            {/* Add comment form — hidden via display when boost panel is open */}
            <div style={{ display: showCommentForm ? undefined : 'none' }}>
                {(() => {
                    const localeConfig = getCommentLocaleConfig(userLocale, post.locale, showTranslated)
                    return (
                        <form onSubmit={handleSubmitComment} className="mb-2 max-w-3xl" style={{ paddingLeft: '18px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <textarea
                                        value={commentText}
                                        onChange={(e) => setCommentText(e.target.value)}
                                        placeholder="Add a comment..."
                                        rows={4}
                                        className="w-full p-2 text-sm"
                                        style={{
                                            background: 'var(--input)',
                                            color: 'var(--foreground)',
                                            border: '1px solid var(--border)',
                                            borderRadius: 0,
                                            outline: 'none',
                                            resize: 'both',
                                            paddingBottom: localeConfig ? '32px' : undefined,
                                        }}
                                        onFocus={(e) => {
                                            e.currentTarget.style.borderColor = 'var(--ring)'
                                        }}
                                        onBlur={(e) => {
                                            e.currentTarget.style.borderColor = 'var(--border)'
                                        }}
                                    />
                                    {localeConfig && (
                                        <div style={{ position: 'absolute', bottom: '12px', right: '8px' }}>
                                            <CommentLocaleToggle
                                                options={localeConfig.options}
                                                value={commentLocale}
                                                onChange={setCommentLocale}
                                            />
                                        </div>
                                    )}
                                </div>
                                <a
                                    href="/formatdoc"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs no-underline hover:underline"
                                    style={{ color: 'var(--meta-color)', paddingBottom: '4px' }}
                                >
                                    help
                                </a>
                            </div>
                            {chainError && (
                                <div className="mt-1 text-xs" style={{ color: 'var(--destructive, #e55)' }}>
                                    {chainError}
                                </div>
                            )}

                            <div className="flex gap-2 mt-2 items-center">
                                <SubmitOnChainButton
                                    label="add comment"
                                    step={step}
                                    successMessage="✓ on-chain"
                                    disabled={!commentText.trim()}
                                    type="submit"
                                    onDone={resetChain}
                                />
                            </div>
                        </form>
                    )
                })()}
            </div>

            {/* Comments */}
            <div id="comments" />
            <CommentThread
                comments={comments}
                postId={post.id}
                postLocale={post.locale}
                translateAll={translateAllActive}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={loadMore}
                onReplyAdded={(newComments: PbComment[]) => {
                    setComments(prev => {
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
                }}
                onCommentEdited={(commentId: bigint, newText: string) => {
                    setComments(prev =>
                        prev.map(c =>
                            c.id === commentId
                                ? { ...c, text: newText } as unknown as PbComment
                                : c
                        )
                    )
                }}
                onCommentDeleted={(commentId: bigint) => {
                    setComments(prev => prev.filter(c => c.id !== commentId))
                }}
            />
        </div>
    )
}
