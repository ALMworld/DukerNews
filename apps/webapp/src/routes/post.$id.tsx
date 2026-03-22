import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { create } from '@bufbuild/protobuf'
import { postAggQueryOptions } from '../lib/query-options'
import { getComments as fetchComments } from '../server/comments'
import { useLocale, type SupportedLocale } from '../lib/locale-context'
import type { PbPost, PbComment } from '@repo/apidefs'
import { applyCommentEvents } from '../lib/apply-events'
import {
    EventType,
    AggType,
    DukerTxReqSchema,
    EventDataSchema,
    CommentCreatedPayloadSchema,
} from '@repo/apidefs'
import CommentThread from '../components/CommentThread'
import CommentLocaleToggle, { getCommentLocaleConfig } from '../components/CommentLocaleToggle'
import { useRequireAuth } from '../lib/useRequireAuth'
import { useChainHandle } from '../client/useChainHandle'
import { DukiPayment, type DukiPaymentValue, type SubmitMethod } from '../components/DukiPayment'
import PostItem from '../components/PostItem'
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
    const [submitting, setSubmitting] = useState(false)
    const [submitMethod, setSubmitMethod] = useState<SubmitMethod>('x402')
    const [boostAmount, setBoostAmount] = useState(0)
    const [paymentChainId, setPaymentChainId] = useState('')
    const [paymentStablecoin, setPaymentStablecoin] = useState('')

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
        setSubmitting(true)
        try {
            const boostMicro = BigInt(Math.round(boostAmount * 1_000_000))
            const txData = create(DukerTxReqSchema, {
                address: me?.ego ?? '',
                aggType: AggType.COMMENT,
                aggId: 0n,  // contract auto-assigns
                evtType: EventType.COMMENT_CREATED,
                paymentChain: paymentChainId,
                paymentStablecoinAddress: paymentStablecoin,
                data: create(EventDataSchema, {
                    payload: {
                        case: 'commentCreated',
                        value: create(CommentCreatedPayloadSchema, {
                            postId: BigInt(Number(post.id)),
                            parentId: 0n,  // top-level comment — no parent
                            text: commentText.trim(),
                            locale: commentLocale,
                            ancestorPath: '',  // no ancestors for root comment
                            boostAmount: boostMicro,
                        }),
                    },
                }),
            })
            const result = await dispatch(txData, submitMethod === 'x402')

            // Apply enriched events to update comments in-place
            if (result.events?.length) {
                setComments(prev => applyCommentEvents(prev, result.events!))
            }

            setCommentText('')
            setBoostAmount(0)
            resetChain()
        } catch {
            // Error shown via chainError state
        } finally {
            setSubmitting(false)
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
                />

                {/* Post body text (text posts only) */}
                {(displayText || post.text) && (
                    <div
                        className="mt-1 text-sm leading-normal"
                        style={{ color: 'var(--foreground)', paddingLeft: '18px' }}
                    >
                        {displayText || post.text}
                    </div>
                )}
            </div>

            {/* Add comment form */}
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
                        {/* DukiPayment — chain method + optional tip */}
                        <div className="mt-2">
                            <DukiPayment
                                dukiBps={me?.dukiBps ?? 5000}
                                amounts={[0, 1, 2, 8]}
                                defaultAmount={0}
                                defaultMethod="x402"
                                amountLabel="Tip (optional)"
                                amountSubLabel="boost your comment"
                                onChange={(v: DukiPaymentValue) => {
                                    setSubmitMethod(v.method)
                                    setBoostAmount(v.amount)
                                    setPaymentChainId(String(v.chainId))
                                    setPaymentStablecoin(v.stablecoinAddress)
                                }}
                                disabled={cmdPending || submitting}
                            />
                        </div>

                        {chainError && (
                            <div className="mt-1 text-xs" style={{ color: 'var(--destructive, #e55)' }}>
                                {chainError}
                            </div>
                        )}

                        <div className="flex gap-2 mt-2 items-center">
                            <button
                                type="submit"
                                disabled={submitting || cmdPending || !commentText.trim()}
                                className="px-3 py-1 text-sm transition-all disabled:opacity-40"
                                style={{
                                    background: (submitting || cmdPending || !commentText.trim()) ? 'var(--background)' : 'var(--duki-600)',
                                    color: (submitting || cmdPending || !commentText.trim()) ? 'var(--foreground)' : 'var(--duki-100)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 0,
                                    cursor: (submitting || cmdPending) ? 'wait' : 'pointer',
                                }}
                            >
                                {cmdPending ? `${step}...` : submitting ? 'posting...' : boostAmount > 0 ? `add comment ($${boostAmount} tip)` : 'add comment'}
                            </button>
                            {step === 'done' && (
                                <span className="text-xs" style={{ color: 'var(--duki-400)' }}>✓ on-chain</span>
                            )}
                        </div>
                    </form>
                )
            })()}

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
