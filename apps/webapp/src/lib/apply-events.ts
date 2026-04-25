/**
 * Client-side event application — pure functions to apply PbEvent[] to React state.
 * Uses enriched event payloads (full entity data) for proper in-memory UI updates.
 */

import type { PbEvent, PbPost, PbComment } from '@repo/dukernews-apidefs'
import { EventType } from '@repo/dukernews-apidefs'
import { setUserEvtSeq } from './client-db'

// ─── Apply Events to Posts ──────────────────────────────

export function applyPostEvents(posts: PbPost[], events: PbEvent[]): PbPost[] {
    let result = [...posts]

    for (const evt of events) {
        switch (evt.evtType) {
            case EventType.POST_CREATED: {
                const p = evt.data?.payload
                if (p?.case === 'postCreated') {
                    const v = p.value
                    const newPost = {
                        id: evt.aggId,  // contract-assigned via AGG_TYPE_POST
                        address: evt.address,
                        username: evt.username,
                        title: v.title,
                        url: v.url,
                        domain: v.domain,
                        text: v.text,
                        kind: v.kind,
                        locale: v.locale,
                        points: 1,  // new post starts with 1 point
                        commentCount: 0,
                        flags: 0,
                        dead: false,
                        boostAmount: Number(v.boostAmount ?? 0),
                        totalBoost: Number(v.boostAmount ?? 0),
                        latestEvtSeq: evt.evtSeq,
                        createdAt: evt.evtTime * BigInt(1000),
                        updatedAt: evt.evtTime * BigInt(1000),
                    } as unknown as PbPost
                    result = [newPost, ...result]
                }
                break
            }

            case EventType.POST_UPVOTED: {
                const postId = evt.aggId
                result = result.map(post =>
                    post.id === postId
                        ? { ...post, points: post.points + 1 } as unknown as PbPost
                        : post
                )
                break
            }

            // Unified upvote — aggType 2=post handled here, 3=comment ignored in post list
            case EventType.UPVOTE_ATTENTION: {
                if (evt.aggType === 2) {
                    const postId = evt.aggId
                    result = result.map(post =>
                        post.id === postId
                            ? { ...post, points: post.points + 1 } as unknown as PbPost
                            : post
                    )
                }
                break
            }

            case EventType.BOOST_ATTENTION: {
                const p = evt.data?.payload
                // Only apply post boosts (aggType=2) in post list
                if (p?.case === 'boostAttention' && evt.aggType === 2) {
                    const postId = evt.aggId
                    const boostDelta = Number(p.value.boostAmount ?? 0)
                    result = result.map(post =>
                        post.id === postId
                            ? { ...post, totalBoost: Number(post.totalBoost ?? 0) + boostDelta } as unknown as PbPost
                            : post
                    )
                }
                break
            }
        }
    }

    return result
}

// ─── Apply Events to Comments ───────────────────────────

export function applyCommentEvents(comments: PbComment[], events: PbEvent[]): PbComment[] {
    let result = [...comments]

    for (const evt of events) {
        switch (evt.evtType) {
            case EventType.COMMENT_CREATED: {
                const p = evt.data?.payload
                if (p?.case === 'commentCreated') {
                    const v = p.value
                    const commentId = evt.aggId  // contract-assigned via AGG_TYPE_COMMENT
                    const newComment = {
                        id: commentId,
                        postId: v.postId,
                        address: evt.address,
                        username: evt.username,
                        text: v.text,
                        locale: v.locale,
                        parentId: v.parentId,
                        ancestorPath: v.ancestorPath,  // ancestors-only
                        depth: v.ancestorPath?.length ? v.ancestorPath.split('.').length : 0,
                        points: 1,  // new comment starts with 1 point
                        dead: false,
                        createdAt: evt.evtTime * BigInt(1000),
                        postTitle: '',
                    } as unknown as PbComment
                    // Don't add duplicates (by ID)
                    if (!result.some(c => c.id === commentId)) {
                        result.push(newComment)
                    }
                }
                break
            }

            case EventType.COMMENT_UPVOTED: {
                const commentId = evt.aggId
                result = result.map(c =>
                    c.id === commentId
                        ? { ...c, points: c.points + 1 } as unknown as PbComment
                        : c
                )
                break
            }

            // Unified upvote — aggType 3=comment handled here, 2=post ignored in comment list
            case EventType.UPVOTE_ATTENTION: {
                if (evt.aggType === 3) {
                    const commentId = evt.aggId
                    result = result.map(c =>
                        c.id === commentId
                            ? { ...c, points: c.points + 1 } as unknown as PbComment
                            : c
                    )
                }
                break
            }

            case EventType.BOOST_ATTENTION: {
                const p = evt.data?.payload
                // Only apply comment boosts (aggType=3) in comment list
                if (p?.case === 'boostAttention' && evt.aggType === 3) {
                    const commentId = evt.aggId
                    const boostDelta = Number(p.value.boostAmount ?? 0)
                    result = result.map(c =>
                        c.id === commentId
                            ? { ...c, totalBoost: Number((c as any).totalBoost ?? 0) + boostDelta } as unknown as PbComment
                            : c
                    )
                }
                break
            }

            case EventType.COMMENT_AMEND: {
                const p = evt.data?.payload
                if (p?.case === 'commentAmended') {
                    const commentId = evt.aggId
                    result = result.map(c =>
                        c.id === commentId
                            ? { ...c, text: p.value.text ?? c.text } as unknown as PbComment
                            : c
                    )
                }
                break
            }

            case EventType.COMMENT_DELETED: {
                const p = evt.data?.payload
                if (p?.case === 'commentDeleted') {
                    const commentId = evt.aggId
                    result = result.filter(c => c.id !== commentId)
                }
                break
            }
        }
    }

    return result
}

// ─── Persist user_evt_seq ───────────────────────────────

export async function persistEvtSeq(address: string, events: PbEvent[]): Promise<void> {
    if (events.length === 0) return
    const lastEvt = events[events.length - 1]
    if (lastEvt) {
        await setUserEvtSeq(address, Number(lastEvt.evtSeq))
    }
}
