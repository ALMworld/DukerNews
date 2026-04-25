import { useState, useRef, useEffect } from 'react'
import { create } from '@bufbuild/protobuf'
import { useAuthStore } from '../lib/authStore'
import { useRequireAuth } from '../lib/useRequireAuth'
import { renderFormattedText } from '../lib/format-text'
import { useLocale, type SupportedLocale } from '../lib/locale-context'
import type { PbComment } from '@repo/dukernews-apidefs'
import { applyCommentEvents } from '../lib/apply-events'
import {
    EventType,
    AggType,
    DukerTxReqSchema,
    EventDataSchema,
    CommentCreatedPayloadSchema,
    CommentAmendPayloadSchema,
    CommentItemPayloadSchema as _CommentItemPayloadSchema,
} from '@repo/dukernews-apidefs'
import { getDisplayText } from '../lib/bagua-text'
import { getLocaleName } from '../client'
import { useChainHandle } from '../client/useChainHandle'
import { useInteractions, VOTE_MASK, VOTE_UP } from '../client/useInteractions'
import { useUpvoteMutation } from '../client/useUpvoteMutation'
import { BoostPanel } from './BoostPanel'
import { BoostArrow } from './BoostArrow'
import { SubmitOnChainButton } from './SubmitOnChainButton'
import { InteractionBar, type ActiveAction } from './InteractionBar'
import CommentLocaleToggle, { getCommentLocaleConfig } from './CommentLocaleToggle'
import CommentMeta from './CommentMeta'
import type { CommentNav, ThreadContext } from './CommentMeta'

/** 64-minute edit/delete window */
export const EDIT_WINDOW_MS = 64 * 60 * 1000

/** Mock user address for dev — set to null to disable mock */
export const MOCK_USER_ADDRESS: string | null = ''



export const linkBtn: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--meta-color)',
    padding: 0,
    fontSize: 'inherit',
    fontFamily: 'inherit',
    textDecoration: 'none',
}

// ---------------------------------------------------------------------------
// CommentItem — pure display, no translation cache knowledge
// ---------------------------------------------------------------------------

export interface CommentItemProps {
    comment: PbComment
    postId: bigint
    postLocale: string
    nav: CommentNav
    hasChildren: boolean
    collapsed: boolean
    hiddenCount: number
    /** Translated text from the parent's TQ cache, or null if not yet fetched */
    translatedText: string | null
    /** True while the parent is fetching this comment's translation */
    isTranslating: boolean
    /** Tell parent to enable this comment's translation query */
    onRequestTranslation: () => void
    /** Whether translateAll is currently active (from CommentThread) */
    translateAll: boolean
    onToggleCollapse: (id: bigint) => void
    onReplyAdded: (comments: PbComment[]) => void
    onCommentEdited: (commentId: bigint, newText: string) => void
    onCommentDeleted: (commentId: bigint) => void
    /** Thread context — when set, renders thread-style header (points/context/on:title) */
    threadCtx?: ThreadContext
    /** Depth offset to subtract from path-computed depth (for threads page) */
    depthOffset?: number
}

export default function CommentItem({
    comment,
    postId,
    postLocale,
    nav,
    hasChildren: _hasChildren,
    collapsed,
    hiddenCount,
    translatedText,
    isTranslating,
    onRequestTranslation,
    translateAll,
    onToggleCollapse,
    onReplyAdded,
    onCommentEdited,
    onCommentDeleted: _onCommentDeleted,
    threadCtx,
    depthOffset = 0,
}: CommentItemProps) {
    const [replyText, setReplyText] = useState('')
    const [editing, setEditing] = useState(false)
    const [editText, setEditText] = useState(comment.text)
    // const [confirmDelete, setConfirmDelete] = useState(false)  // delete hidden — see below
    const [localBoost, setLocalBoost] = useState(Number(comment.totalBoost ?? 0))

    // On-chain dispatch via useChainHandle
    const { dispatch, step, error: chainError, reset: resetChain } = useChainHandle()
    const cmdPending = step !== 'idle' && step !== 'done'
    const [activeAction, setActiveAction] = useState<ActiveAction>('none')


    // Local display state:
    // showTranslated = user manually requested translation
    // hiddenByUser   = user clicked "original" to override translateAll; resets when translateAll changes
    const [showTranslated, setShowTranslated] = useState(false)
    const [hiddenByUser, setHiddenByUser] = useState(false)
    useEffect(() => { setHiddenByUser(false) }, [translateAll])

    // Auto-show when translation first arrives (for manual requests)
    const prevTranslatedRef = useRef<string | null>(null)
    useEffect(() => {
        if (translatedText && prevTranslatedRef.current === null && showTranslated) {
            // already flagged, nothing to do — displayText will update automatically
        }
        prevTranslatedRef.current = translatedText
    }, [translatedText])

    const { locale: userLocale } = useLocale()
    const { me } = useAuthStore()
    const { requireAuth } = useRequireAuth()

    // IDB-backed interaction state for comment upvote
    const { getBits } = useInteractions()
    const currentBits = getBits(AggType.COMMENT, Number(comment.id))
    const voted = (currentBits & VOTE_MASK) === VOTE_UP

    const currentUsername = me?.username ?? ''
    const isMockMode = MOCK_USER_ADDRESS !== null && !me?.ego
    const isOwn = isMockMode
        ? comment.username === currentUsername
        : (currentUsername !== '' && comment.username === currentUsername)
    const createdAtMs = typeof comment.createdAt === 'bigint' ? Number(comment.createdAt) : comment.createdAt
    const isWithinWindow = Date.now() - createdAtMs < EDIT_WINDOW_MS
    const canEdit = isOwn && isWithinWindow
    // const canDelete = isOwn && isWithinWindow && !hasChildren  // delete hidden — see action bar below

    // Upvote mutation via TanStack Query
    const upvoteMutation = useUpvoteMutation({
        aggType: AggType.COMMENT,
        aggId: Number(comment.id),
        address: me?.ego ?? '',
    })

    const handleUpvote = () => {
        if (voted || upvoteMutation.isPending || !me?.ego) return
        upvoteMutation.mutate()
    }

    const commentLocale = (comment.locale || postLocale) as SupportedLocale
    const needsTranslation = commentLocale !== userLocale
    // Effective: show translation if (translateAll OR manually requested) AND not hidden by user AND translation exists
    const effectiveShowTranslated = !hiddenByUser && (translateAll || showTranslated) && !!translatedText
    const replyLocaleConfig = getCommentLocaleConfig(userLocale, commentLocale, effectiveShowTranslated)
    const [replyLocale, setReplyLocale] = useState<SupportedLocale>(
        replyLocaleConfig?.defaultLocale ?? userLocale
    )

    const handleTranslateClick = () => {
        if (!translatedText && !isTranslating) {
            // First time: kick off the fetch via parent; show when it arrives
            setShowTranslated(true)
            setHiddenByUser(false)
            onRequestTranslation()
            return
        }
        if (effectiveShowTranslated) {
            // Currently showing translated — user wants original
            if (translateAll) {
                setHiddenByUser(true)  // override translateAll for this comment
            } else {
                setShowTranslated(false)
            }
            if (replyLocaleConfig) setReplyLocale(replyLocaleConfig.options[0])
        } else {
            // Currently showing original — user wants translation back
            setShowTranslated(true)
            setHiddenByUser(false)
            setReplyLocale(userLocale)
        }
    }

    const handleSubmitReply = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!replyText.trim() || cmdPending || !me?.ego) return
        try {
            const txData = create(DukerTxReqSchema, {
                address: me.ego,
                aggType: AggType.COMMENT,
                aggId: 0n,  // contract auto-assigns
                evtType: EventType.COMMENT_CREATED,
                data: create(EventDataSchema, {
                    payload: {
                        case: 'commentCreated',
                        value: create(CommentCreatedPayloadSchema, {
                            postId: BigInt(postId),
                            parentId: BigInt(comment.id),
                            text: replyText.trim(),
                            locale: replyLocale,
                            ancestorPath: comment.ancestorPath?.length
                                ? comment.ancestorPath + '.' + comment.id
                                : String(comment.id),
                            boostAmount: 0n,  // always free; boost via dedicated action
                        }),
                    },
                }),
            })
            const result = await dispatch(txData, false)  // direct chain — free op

            // Apply events to get the new comment(s), pass to parent
            if (result.events?.length) {
                const newComments = applyCommentEvents([], result.events)
                if (newComments.length > 0) onReplyAdded(newComments)
            }

            setReplyText(''); setActiveAction('none')
            resetChain()
        } catch {
            // Error shown via chainError state
        }
    }

    const handleEdit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editText.trim() || cmdPending || !me?.ego) return
        try {
            const txData = create(DukerTxReqSchema, {
                address: me.ego,
                aggType: AggType.COMMENT,
                aggId: BigInt(comment.id),
                evtType: EventType.COMMENT_AMEND,
                data: create(EventDataSchema, {
                    payload: {
                        case: 'commentAmended',
                        value: create(CommentAmendPayloadSchema, {
                            text: editText.trim(),
                        }),
                    },
                }),
            })
            await dispatch(txData, false)  // direct chain — free op
            onCommentEdited(comment.id, editText.trim())
            setEditing(false)
            resetChain()
        } catch {
            // Error shown via chainError state
        }
    }

    // handleDelete — hidden for now, uncomment alongside delete UI below
    // const handleDelete = async () => {
    //     if (cmdPending || !me?.ego) return
    //     try {
    //         const txData = create(DukerTxReqSchema, {
    //             address: me.ego,
    //             aggType: AggType.COMMENT,
    //             aggId: BigInt(comment.id),
    //             evtType: EventType.COMMENT_DELETED,
    //             data: create(EventDataSchema, {
    //                 payload: {
    //                     case: 'commentDeleted',
    //                     value: create(CommentItemPayloadSchema, {
    //                         commentId: BigInt(comment.id),
    //                     }),
    //                 },
    //             }),
    //         })
    //         await dispatch(txData, false)  // direct chain — free op
    //         onCommentDeleted(comment.id)
    //         resetChain()
    //     } catch {
    //         // Error shown via chainError state
    //     }
    // }

    const baseText = getDisplayText(comment.text, userLocale)
    const displayText = effectiveShowTranslated ? translatedText! : baseText
    const rawDepth = comment.ancestorPath?.length ? comment.ancestorPath.split('.').length : 0
    const depth = Math.max(0, rawDepth - depthOffset)

    return (
        <div style={{ marginLeft: depth * 40 }} className="pt-2">
            <div id={`${comment.id}`} style={{ display: 'flex', gap: '4px' }}>
                {/* Upvote gutter — shared BoostArrow */}
                <div style={{ flexShrink: 0, width: '20px', display: 'flex', justifyContent: 'center', paddingTop: '1px' }}>
                    <BoostArrow
                        totalBoost={localBoost}
                        voted={voted}
                        isOwn={isOwn}
                        loading={upvoteMutation.isPending}
                        onClick={handleUpvote}
                    />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Header */}
                    <CommentMeta
                        comment={comment}
                        nav={threadCtx ? undefined : nav}
                        threadCtx={threadCtx}
                        collapsed={collapsed}
                        hiddenCount={hiddenCount}
                        onToggleCollapse={onToggleCollapse}
                    />

                    {!collapsed && (
                        <>
                            {editing ? (
                                <form onSubmit={handleEdit} className="mt-1 mb-2 max-w-3xl">
                                    <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={4} className="w-full p-2 text-sm" style={{ background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 0, outline: 'none', resize: 'both' }} />
                                    <div className="flex gap-2 mt-1">
                                        <button type="submit" disabled={cmdPending || !editText.trim()} className="px-3 py-1 text-xs transition-all disabled:opacity-40" style={{ background: (cmdPending || !editText.trim()) ? 'var(--background)' : 'var(--duki-600)', color: (cmdPending || !editText.trim()) ? 'var(--foreground)' : 'var(--duki-100)', border: '1px solid var(--border)', borderRadius: 0, cursor: cmdPending ? 'wait' : 'pointer' }}>{cmdPending ? 'saving...' : 'update'}</button>
                                        <button type="button" onClick={() => { setEditing(false); setEditText(comment.text) }} className="px-3 py-1 text-xs" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 0, cursor: 'pointer', color: 'var(--meta-color)' }}>cancel</button>
                                    </div>
                                </form>
                            ) : (
                                <div className="text-sm" style={{ color: 'var(--foreground)', lineHeight: '1.4', marginTop: '2px' }}>
                                    {isTranslating && !translatedText
                                        ? <span style={{ color: 'var(--meta-color)', fontStyle: 'italic' }}>translating...</span>
                                        : renderFormattedText(displayText)}
                                </div>
                            )}

                            {!editing && (
                                <div className="flex items-center" style={{ fontSize: '8pt', marginTop: '2px', gap: '6px' }}>
                                    <InteractionBar
                                        activeAction={activeAction}
                                        onReply={() => { if (requireAuth()) { setActiveAction(a => a === 'reply' ? 'none' : 'reply') } }}
                                        onBoost={() => { if (requireAuth()) { setActiveAction(a => a === 'boost' ? 'none' : 'boost') } }}
                                    />
                                    {canEdit && <>
                                        <span style={{ opacity: 0.5, color: 'var(--meta-color)' }}>|</span>
                                        <button onClick={() => setEditing(true)} className="meta-link" style={linkBtn}>edit</button>
                                    </>}
                                    {/* delete — hidden for now, uncomment when ready
                                    <>
                                        <span style={{ opacity: 0.2, color: 'var(--meta-color)' }}>|</span>
                                        {canDelete && !confirmDelete && <button onClick={() => setConfirmDelete(true)} className="meta-link" style={linkBtn}>delete</button>}
                                        {canDelete && confirmDelete && (
                                            <>
                                                <button onClick={handleDelete} className="meta-link" style={{ ...linkBtn, color: 'var(--destructive, #e55)' }}>sure?</button>
                                                <button onClick={() => setConfirmDelete(false)} className="meta-link" style={linkBtn}>cancel</button>
                                            </>
                                        )}
                                    </>
                                    */}
                                    {needsTranslation && <>
                                        <span style={{ opacity: 0.2, color: 'var(--meta-color)' }}>|</span>
                                        <button
                                            onClick={handleTranslateClick}
                                            disabled={isTranslating && !translatedText}
                                            className="meta-link transition-colors"
                                            style={{
                                                ...linkBtn,
                                                color: effectiveShowTranslated ? 'var(--duki-400)' : 'var(--meta-color)',
                                                cursor: isTranslating && !translatedText ? 'wait' : 'pointer',
                                            }}
                                            title={effectiveShowTranslated
                                                ? `Original (${getLocaleName(commentLocale)})`
                                                : `Translate from ${getLocaleName(commentLocale)}`}
                                        >
                                            {isTranslating && !translatedText
                                                ? '...'
                                                : effectiveShowTranslated
                                                    ? `original (${getLocaleName(commentLocale)})`
                                                    : 'translate'}
                                        </button>
                                    </>}
                                </div>
                            )}

                            {/* Inline boost panel — hidden via display when not active */}
                            <div style={{ display: (activeAction === 'boost' && !editing) ? undefined : 'none' }}>
                                <BoostPanel
                                    aggType={AggType.COMMENT}
                                    aggId={BigInt(comment.id)}
                                    amounts={[1, 2, 8, 16]}
                                    defaultAmount={1}
                                    subLabel="boost this comment"
                                    onSuccess={(micro) => setLocalBoost(b => b + micro)}
                                    onCancel={() => setActiveAction('none')}
                                />
                            </div>

                            <div style={{ display: activeAction === 'reply' ? undefined : 'none' }}>
                                <form onSubmit={handleSubmitReply} className="mt-1 mb-2 max-w-3xl">
                                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
                                        <div style={{ position: 'relative', flex: 1 }}>
                                            <textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Write a thoughtful reply..." rows={3} className="w-full p-2 rounded text-sm" style={{ background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 0, outline: 'none', resize: 'both', paddingBottom: replyLocaleConfig ? '32px' : undefined }} onFocus={e => { e.currentTarget.style.borderColor = 'var(--ring)' }} onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }} />
                                            {replyLocaleConfig && (
                                                <div style={{ position: 'absolute', bottom: '12px', right: '8px' }}>
                                                    <CommentLocaleToggle options={replyLocaleConfig.options} value={replyLocale} onChange={setReplyLocale} />
                                                </div>
                                            )}
                                        </div>
                                        <a href="/formatdoc" target="_blank" rel="noopener noreferrer" className="text-xs no-underline hover:underline" style={{ color: 'var(--meta-color)', paddingBottom: '4px' }}>help</a>
                                    </div>

                                    {chainError && (
                                        <div className="mt-1 text-xs" style={{ color: 'var(--destructive, #e55)' }}>
                                            {chainError}
                                        </div>
                                    )}

                                    <div className="flex gap-2 mt-2 items-center">
                                        <SubmitOnChainButton
                                            label="reply"
                                            step={step}
                                            successMessage="✓ on-chain"
                                            disabled={!replyText.trim()}
                                            type="submit"
                                            onDone={resetChain}
                                        />
                                        <button type="button" onClick={() => { setActiveAction('none'); setReplyText(''); resetChain() }} className="px-3 py-1 text-xs" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 0, cursor: 'pointer', color: 'var(--meta-color)' }}>cancel</button>
                                    </div>
                                </form>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
