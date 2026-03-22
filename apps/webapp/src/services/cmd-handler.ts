/**
 * Server-side command handler — dispatches unified Cmd to service functions.
 * Returns PbDeltaEventsResp with enriched events for in-memory UI updates.
 * 
 * Used by ConnectRPC service — returns proper proto messages via create().
 */

import { getKysely } from '../lib/db'
import { create } from '@bufbuild/protobuf'
import {
    CmdType,
    EventType,
    type Cmd,
    type PbDeltaEventsResp,
    type PbEvent,
    PbEventSchema,
    PbDeltaEventsRespSchema,
} from '@repo/apidefs'
import * as PostService from './post-service'
import * as CommentService from './comment-service'

// ─── Command Handler ─────────────────────────────────────

/** 64-minute edit/delete window (must match client-side constant) */
const EDIT_WINDOW_MS = 64 * 60 * 1000

export async function handleCmd(cmd: Cmd): Promise<PbDeltaEventsResp> {
    const db = getKysely()
    if (!db) throw new Error('Database not available')

    const now = Date.now()
    const address = cmd.address
    const payload = cmd.data?.payload

    // Resolve username from address (needed for author checks)
    const userRow = await db
        .selectFrom('users')
        .select('username')
        .where('address', '=', address)
        .executeTakeFirst()
    const username = userRow?.username ?? ''

    if (!payload) throw new Error('Missing command data payload')

    switch (cmd.cmdType) {
        case CmdType.CREATE_POST: {
            if (payload.case !== 'createPost') throw new Error('Payload mismatch')
            const p = payload.value

            const post = await PostService.createPost({
                title: p.title,
                url: p.url,
                text: p.text,
                kind: p.kind,
                locale: p.locale,
                address,
                username: '',
            })

            const event = await insertEvent(db, address, post.username, EventType.POST_CREATED, now, {
                case: 'postCreated',
                value: {
                    id: post.id,
                    title: post.title,
                    url: post.url,
                    text: post.text,
                    kind: post.kind,
                    locale: post.locale,
                    domain: post.domain,
                    points: post.points,
                },
            })

            return buildResp([event], address, db)
        }

        case CmdType.UPVOTE_POST: {
            if (payload.case !== 'upvotePost') throw new Error('Payload mismatch')

            // PostUpvotedPayload now only has boost_amount
            // postId comes from aggId context — for legacy cmd path, skip
            console.log('[cmd-handler] UPVOTE_POST: legacy cmd path, not implemented for new proto')
            return buildResp([], address, db)
        }

        case CmdType.CREATE_COMMENT: {
            if (payload.case !== 'createComment') throw new Error('Payload mismatch')

            // Legacy cmd path — not used with on-chain events
            console.log('[cmd-handler] CREATE_COMMENT: legacy cmd path, not implemented for new proto')
            return buildResp([], address, db)
        }

        case CmdType.UPVOTE_COMMENT: {
            if (payload.case !== 'upvoteComment') throw new Error('Payload mismatch')
            // CommentUpvotedPayload now only has boost_amount, no commentId
            // Legacy cmd path — not used with on-chain events
            console.log('[cmd-handler] UPVOTE_COMMENT: legacy cmd path, not implemented for new proto')
            return buildResp([], address, db)
        }

        case CmdType.AMEND_COMMENT: {
            if (payload.case !== 'amendComment') throw new Error('Payload mismatch')
            // CommentAmendPayload now only has text, no commentId
            // Legacy cmd path — not used with on-chain events
            console.log('[cmd-handler] AMEND_COMMENT: legacy cmd path, not implemented for new proto')
            return buildResp([], address, db)
        }

        case CmdType.DELETE_COMMENT: {
            if (payload.case !== 'deleteComment') throw new Error('Payload mismatch')
            const p = payload.value

            // CommentItemPayload still has comment_id
            const commentToDelete = await db
                .selectFrom('comments')
                .select(['username', 'created_at'])
                .where('id', '=', p.commentId)
                .executeTakeFirst()
            if (!commentToDelete) throw new Error('Comment not found')
            if (!import.meta.env.DEV && commentToDelete.username !== username) {
                throw new Error('Not the comment author')
            }
            if (now - Number(commentToDelete.created_at) > EDIT_WINDOW_MS) {
                throw new Error('Edit window expired (64 minutes)')
            }
            const childCount = await db
                .selectFrom('comments')
                .select(db.fn.countAll().as('cnt'))
                .where('parent_id', '=', p.commentId)
                .where('dead', '=', 0)
                .executeTakeFirst()
            if (Number(childCount?.cnt ?? 0) > 0) {
                throw new Error('Cannot delete a comment with replies')
            }

            await CommentService.deleteComment(p.commentId)

            const event = await insertEvent(db, address, '', EventType.COMMENT_DELETED, now, {
                case: 'commentDeleted',
                value: { commentId: p.commentId },
            })

            return buildResp([event], address, db)
        }

        default:
            throw new Error(`Unsupported command type: ${cmd.cmdType}`)
    }
}

// ─── Helpers ─────────────────────────────────────────────

async function insertEvent(
    db: NonNullable<ReturnType<typeof getKysely>>,
    address: string,
    username: string,
    evtType: EventType,
    evtTime: number,
    eventPayload: any,
): Promise<PbEvent> {
    const now = Date.now()

    await db
        .insertInto('events')
        .values({
            address,
            username,
            evt_type: evtType,
            evt_time: evtTime,
            payload: null,
            created_at: now,
        })
        .execute()

    const row = await db
        .selectFrom('events')
        .selectAll()
        .where('address', '=', address)
        .where('evt_time', '=', evtTime)
        .orderBy('evt_seq', 'desc')
        .executeTakeFirst()

    return create(PbEventSchema, {
        evtSeq: BigInt(row?.evt_seq ?? 0),
        address,
        username,
        evtType,
        evtTime: BigInt(evtTime),
        data: { payload: eventPayload },
        createdAt: BigInt(now),
    })
}

async function buildResp(
    events: PbEvent[],
    address: string,
    db: NonNullable<ReturnType<typeof getKysely>>,
): Promise<PbDeltaEventsResp> {
    const lastEvt = events[events.length - 1]
    const newSeq = lastEvt ? Number(lastEvt.evtSeq) : 0

    await db
        .updateTable('users')
        .set({ latest_evt_seq: newSeq, updated_at: Date.now() })
        .where('address', '=', address)
        .execute()

    return create(PbDeltaEventsRespSchema, {
        events,
        syncCursor: BigInt(newSeq),
    })
}
