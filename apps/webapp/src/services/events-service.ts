/**
 * events-service.ts — Apply domain changes to DB tables + persist events.
 *
 * TS port of Go es_handler.go Process().
 * Dispatches by EventType, mutates domain tables (users, posts, comments),
 * and appends rows to the events table.
 */

import { getKysely } from '../lib/db'
import { sql } from 'kysely'
import { toBinary, fromBinary, create } from '@bufbuild/protobuf'
import { EventType, AggType, EventDataSchema, PbEventSchema, type PbEvent } from '@repo/apidefs'
import * as PostService from './post-service'
import * as CommentService from './comment-service'
import * as InteractionService from './interaction-service'

// ─── Result type ─────────────────────────────────────────

export interface ApplyResult {
    evtSeq: number
    eventType: EventType
    username?: string
}

// ─── DB Lookup ───────────────────────────────────────────

/**
 * Retrieve events from DB by txHash. Returns PbEvent[] if webhook already indexed,
 * empty array if not found — caller should fall back to RPC.
 */
export async function getEventsByTxHash(txHash: string): Promise<PbEvent[]> {
    const db = getKysely()
    if (!db) return []

    const rows = await db
        .selectFrom('events')
        .selectAll()
        .where('tx_hash', '=', txHash)
        .orderBy('evt_seq', 'asc')
        .execute()

    if (rows.length === 0) return []

    return rows.map(row => create(PbEventSchema, {
        evtSeq: BigInt(row.evt_seq ?? 0),
        address: row.address,
        username: row.username,
        evtType: row.evt_type,
        aggType: row.agg_type,
        aggId: BigInt(row.agg_id),
        evtTime: BigInt(Math.floor(row.evt_time / 1000)),
        blockNumber: BigInt(row.block_number ?? 0),
        txHash: row.tx_hash,
        userSeq: BigInt(row.user_evt_seq ?? 0),
        data: row.payload ? fromBinary(EventDataSchema, new Uint8Array(row.payload as unknown as ArrayBuffer)) : undefined,
    }))
}

// ─── Public API ──────────────────────────────────────────

/**
 * Apply a batch of events: mutate domain tables + persist to events table.
 * Mirrors Go es_handler.go Process().
 */
export async function applyEvents(events: PbEvent[]): Promise<ApplyResult[]> {
    if (events.length === 0) return []

    const db = getKysely()
    if (!db) throw new Error('Database not available')

    const results: ApplyResult[] = []

    // Batch dedup: query all evt_seq in one round-trip
    const evtSeqs = events.map(e => Number(e.evtSeq))
    const existingRows = await db
        .selectFrom('events')
        .select('evt_seq')
        .where('evt_seq', 'in', evtSeqs)
        .execute()
    const existingSeqs = new Set(existingRows.map(r => r.evt_seq))

    for (const evt of events) {
        const seq = Number(evt.evtSeq)

        // Layer 1: batch query fast filter
        if (existingSeqs.has(seq)) {
            console.log(`[events-service] Skipping duplicate evtSeq=${seq}`)
            results.push({ evtSeq: seq, eventType: evt.evtType })
            continue
        }

        // Layer 2: insert first — if conflict (already processed), skip
        const insertResult = await db
            .insertInto('events')
            .values({
                evt_seq: seq,
                address: evt.address,
                username: evt.username,
                evt_type: evt.evtType,
                agg_type: evt.aggType,
                agg_id: Number(evt.aggId),
                evt_time: Number(evt.evtTime) * 1000,
                block_number: Number(evt.blockNumber ?? 0),
                tx_hash: evt.txHash ?? '',
                user_evt_seq: Number(evt.userSeq ?? 0),
                payload: evt.data ? toBinary(EventDataSchema, evt.data) : null,
                created_at: Date.now(),
            })
            .onConflict(oc => oc.doNothing())
            .executeTakeFirst()

        // if (insertResult.numInsertedOrUpdatedRows === 0n) {
        //     console.log(`[events-service] Skipping duplicate evtSeq=${seq} (conflict)`)
        //     results.push({ evtSeq: seq, eventType: evt.evtType })
        //     continue
        // }

        // Event is new — apply domain changes
        const result = await applyEvent(evt)
        results.push(result)
    }

    // Update latest_evt_seq per user — single CASE WHEN query (one D1 round-trip)
    const seqByAddress = new Map<string, number>()
    for (const evt of events) {
        const seq = Number(evt.evtSeq)
        const prev = seqByAddress.get(evt.address) ?? 0
        if (seq > prev) seqByAddress.set(evt.address, seq)
    }
    if (seqByAddress.size > 0) {
        const now = Date.now()
        const addrs = [...seqByAddress.keys()]
        const caseClauses = addrs
            .map(a => `WHEN '${a}' THEN ${seqByAddress.get(a)!}`)
            .join(' ')
        await sql`
            UPDATE users
            SET latest_evt_seq = CASE address ${sql.raw(caseClauses)} END,
                updated_at = ${now}
            WHERE address IN (${sql.join(addrs.map(a => sql`${a}`))})
        `.execute(db)
    }

    return results
}

// ─── Event appliers ──────────────────────────────────────

async function applyEvent(evt: PbEvent): Promise<ApplyResult> {
    const now = Date.now()

    switch (evt.evtType) {

        // ─── Post events ─────────────────────────────────
        case EventType.POST_CREATED: {
            const p = evt.data?.payload
            if (p?.case !== 'postCreated') throw new Error('POST_CREATED: missing payload')
            const v = p.value

            await ensureUser(evt.address, evt.username, now)
            await PostService.createPost({
                aggId: evt.aggId,
                title: v.title,
                url: v.url,
                text: v.text,
                titleEn: v.titleEn,
                urlEn: v.urlEn,
                textEn: v.textEn,
                kind: v.kind,
                locale: v.locale,
                address: evt.address,
                username: evt.username,
            })

            console.log(`[events-service] POST_CREATED: "${v.title}" by ${evt.username}`)
            return { evtSeq: Number(evt.evtSeq), eventType: evt.evtType }
        }

        case EventType.POST_UPVOTED: {
            await PostService.upvotePost({
                postId: evt.aggId,
                address: evt.address,
                boostAmount: 0n,  // upvote is free — no boost
            })
            console.log(`[events-service] POST_UPVOTED: post=${evt.aggId} by ${evt.address}`)
            return { evtSeq: Number(evt.evtSeq), eventType: evt.evtType }
        }

        // Unified upvote — agg_type: 2=post, 3=comment
        case EventType.UPVOTE_ATTENTION: {
            const db = getKysely()
            const username = evt.username  // already in event from contract
            if (evt.aggType === 2) {
                // Post upvote
                await PostService.upvotePost({
                    postId: evt.aggId,
                    address: evt.address,
                    boostAmount: 0n,
                })
                // Save vote bit for the actor
                if (username) {
                    await InteractionService.setVote(username, AggType.POST, evt.aggId, InteractionService.VOTE_UP)
                }
            } else if (evt.aggType === 3 && db) {
                // Comment upvote
                if (username) {
                    await InteractionService.setVote(username, AggType.COMMENT, evt.aggId, InteractionService.VOTE_UP)
                }
                await db
                    .updateTable('comments')
                    .set({ points: sql`points + 1` })
                    .where('id', '=', Number(evt.aggId) as any) // D1 needs Number
                    .execute()
            }
            console.log(`[events-service] UPVOTE_ATTENTION: aggType=${evt.aggType} id=${evt.aggId} by ${evt.username}`)
            return { evtSeq: Number(evt.evtSeq), eventType: evt.evtType }
        }

        case EventType.POST_AMEND: {
            const p = evt.data?.payload
            if (p?.case !== 'postAmended') throw new Error('POST_AMEND: missing payload')

            const db = getKysely()
            if (db) {
                await db
                    .updateTable('posts')
                    .set({
                        title: p.value.title,
                        url: p.value.url,
                        text: p.value.text,
                        title_en: p.value.titleEn,
                        url_en: p.value.urlEn,
                        text_en: p.value.textEn,
                        updated_at: now,
                    })
                    .where('id', '=', Number(evt.aggId) as any) // D1 needs Number
                    .execute()
            }

            console.log(`[events-service] POST_AMEND: post=${evt.aggId}`)
            return { evtSeq: Number(evt.evtSeq), eventType: evt.evtType }
        }

        case EventType.POST_DELETED: {
            const p = evt.data?.payload
            if (p?.case !== 'postDeleted') throw new Error('POST_DELETED: missing payload')

            const db = getKysely()
            if (db) {
                await db
                    .updateTable('posts')
                    .set({ dead: 1, updated_at: now })
                    .where('id', '=', Number(evt.aggId) as any) // D1 needs Number
                    .execute()
            }

            console.log(`[events-service] POST_DELETED: post=${evt.aggId}`)
            return { evtSeq: Number(evt.evtSeq), eventType: evt.evtType }
        }

        case EventType.POST_FLAGGED: {
            const p = evt.data?.payload
            if (p?.case !== 'postFlagged') throw new Error('POST_FLAGGED: missing payload')

            const db = getKysely()
            if (db) {
                await db
                    .updateTable('posts')
                    .set({ flags: sql`flags + 1`, updated_at: now })
                    .where('id', '=', Number(evt.aggId) as any) // D1 needs Number
                    .execute()
            }

            console.log(`[events-service] POST_FLAGGED: post=${evt.aggId}`)
            return { evtSeq: Number(evt.evtSeq), eventType: evt.evtType }
        }

        case EventType.POST_DEAD: {
            const p = evt.data?.payload
            if (p?.case !== 'postDead') throw new Error('POST_DEAD: missing payload')

            const db = getKysely()
            if (db) {
                await db
                    .updateTable('posts')
                    .set({ dead: 1, updated_at: now })
                    .where('id', '=', Number(evt.aggId) as any) // D1 needs Number
                    .execute()
            }

            console.log(`[events-service] POST_DEAD: post=${evt.aggId}`)
            return { evtSeq: Number(evt.evtSeq), eventType: evt.evtType }
        }

        // ─── Comment events ──────────────────────────────

        case EventType.COMMENT_CREATED: {
            await ensureUser(evt.address, evt.username, now)
            await CommentService.addComment(evt)

            console.log(`[events-service] COMMENT_CREATED: comment=${evt.aggId} by ${evt.username}`)
            return { evtSeq: Number(evt.evtSeq), eventType: evt.evtType }
        }

        case EventType.COMMENT_UPVOTED: {
            const db = getKysely()
            if (db) {
                if (evt.username) {
                    await InteractionService.setVote(evt.username, AggType.COMMENT, evt.aggId, InteractionService.VOTE_UP)
                }
                // Upvote is free — only increment points, no boost delta
                await db
                    .updateTable('comments')
                    .set({ points: sql`points + 1` })
                    .where('id', '=', Number(evt.aggId) as any) // D1 needs Number
                    .execute()
            }
            console.log(`[events-service] COMMENT_UPVOTED (legacy): comment=${evt.aggId} by ${evt.username}`)
            return { evtSeq: Number(evt.evtSeq), eventType: evt.evtType }
        }

        case EventType.BOOST_ATTENTION: {
            const p = evt.data?.payload
            if (p?.case !== 'boostAttention') throw new Error('BOOST_ATTENTION: missing payload')
            const boostDelta = Number(p.value.boostAmount ?? 0)
            const username = evt.username  // already in event from contract
            const aggId = Number(evt.aggId)  // D1 doesn't support bigint

            const db = getKysely()
            if (db) {
                const isPost = evt.aggType === 2
                const table  = isPost ? 'posts' : 'comments'

                // Always accumulate the economic boost
                await db
                    .updateTable(table as any)
                    .set({ total_boost: sql`COALESCE(total_boost, 0) + ${boostDelta}` })
                    .where('id', '=', aggId as any)
                    .execute()

                // Boost = upvote + money.
                // If the user hasn't voted yet, a boost also counts as an implicit upvote
                // (increments points). Existing votes — up or down — are preserved.
                if (username) {
                    const targetType = isPost ? AggType.POST : AggType.COMMENT
                    const currentVote = await InteractionService.getVote(username, targetType, BigInt(aggId))
                    if (currentVote === InteractionService.VOTE_NONE) {
                        await InteractionService.setVote(username, targetType, BigInt(aggId), InteractionService.VOTE_UP)
                        await db
                            .updateTable(table as any)
                            .set({ points: sql`points + 1` })
                            .where('id', '=', aggId as any)
                            .execute()
                    }
                }
            }

            // Record BIT_BOOST so client sync shows the boost indicator
            if (username) {
                const targetType = evt.aggType === 2 ? AggType.POST : AggType.COMMENT
                await InteractionService.setBits(username, targetType, BigInt(aggId), InteractionService.BIT_BOOST)
            }

            console.log(`[events-service] BOOST_ATTENTION: aggType=${evt.aggType} id=${aggId} +$${boostDelta / 1e6}`)
            return { evtSeq: Number(evt.evtSeq), eventType: evt.evtType }
        }

        case EventType.COMMENT_AMEND: {
            const p = evt.data?.payload
            if (p?.case !== 'commentAmended') throw new Error('COMMENT_AMEND: missing payload')

            await CommentService.amendComment(evt.aggId, p.value.text)

            console.log(`[events-service] COMMENT_AMEND: comment=${evt.aggId}`)
            return { evtSeq: Number(evt.evtSeq), eventType: evt.evtType }
        }

        case EventType.COMMENT_DELETED: {
            const p = evt.data?.payload
            if (p?.case !== 'commentDeleted') throw new Error('COMMENT_DELETED: missing payload')

            await CommentService.deleteComment(evt.aggId)

            console.log(`[events-service] COMMENT_DELETED: comment=${evt.aggId}`)
            return { evtSeq: Number(evt.evtSeq), eventType: evt.evtType }
        }

        case EventType.COMMENT_FLAGGED: {
            const p = evt.data?.payload
            if (p?.case !== 'commentFlagged') throw new Error('COMMENT_FLAGGED: missing payload')

            // Flag handling — just log for now
            console.log(`[events-service] COMMENT_FLAGGED: comment=${evt.aggId}`)
            return { evtSeq: Number(evt.evtSeq), eventType: evt.evtType }
        }

        case EventType.COMMENT_DEAD: {
            const p = evt.data?.payload
            if (p?.case !== 'commentDead') throw new Error('COMMENT_DEAD: missing payload')

            const db = getKysely()
            if (db) {
                await db
                    .updateTable('comments')
                    .set({ dead: 1 })
                    .where('id', '=', Number(evt.aggId) as any) // D1 needs Number
                    .execute()
            }

            console.log(`[events-service] COMMENT_DEAD: comment=${evt.aggId}`)
            return { evtSeq: Number(evt.evtSeq), eventType: evt.evtType }
        }

        // ─── Like events ─────────────────────────────────

        case EventType.POST_LIKED: {
            const p = evt.data?.payload
            if (p?.case !== 'postLiked') throw new Error('POST_LIKED: missing payload')

            const username = evt.username
            if (username) {
                await InteractionService.setVote(username, evt.aggType as AggType, p.value.itemId, InteractionService.VOTE_UP)
            }

            console.log(`[events-service] POST_LIKED: aggType=${evt.aggType} id=${p.value.itemId}`)
            return { evtSeq: Number(evt.evtSeq), eventType: evt.evtType }
        }

        case EventType.POST_UNLIKED: {
            const p = evt.data?.payload
            if (p?.case !== 'postUnliked') throw new Error('POST_UNLIKED: missing payload')

            const username = evt.username
            if (username) {
                await InteractionService.setVote(username, evt.aggType as AggType, p.value.itemId, 0)
            }

            console.log(`[events-service] POST_UNLIKED: aggType=${evt.aggType} id=${p.value.itemId}`)
            return { evtSeq: Number(evt.evtSeq), eventType: evt.evtType }
        }

        case EventType.COMMENT_LIKED: {
            const p = evt.data?.payload
            if (p?.case !== 'commentLiked') throw new Error('COMMENT_LIKED: missing payload')

            const username = evt.username
            if (username) {
                await InteractionService.setVote(username, evt.aggType as AggType, p.value.itemId, InteractionService.VOTE_UP)
            }

            console.log(`[events-service] COMMENT_LIKED: aggType=${evt.aggType} id=${p.value.itemId}`)
            return { evtSeq: Number(evt.evtSeq), eventType: evt.evtType }
        }

        case EventType.COMMENT_UNLIKED: {
            const p = evt.data?.payload
            if (p?.case !== 'commentUnliked') throw new Error('COMMENT_UNLIKED: missing payload')

            const username = evt.username
            if (username) {
                await InteractionService.setVote(username, evt.aggType as AggType, p.value.itemId, 0)
            }

            console.log(`[events-service] COMMENT_UNLIKED: aggType=${evt.aggType} id=${p.value.itemId}`)
            return { evtSeq: Number(evt.evtSeq), eventType: evt.evtType }
        }

        // ─── User events ─────────────────────────────────

        case EventType.USER_MINTED: {
            const p = evt.data?.payload
            if (p?.case !== 'userMinted') throw new Error('USER_MINTED: missing payload')
            const v = p.value

            const db = getKysely()
            if (db) {
                const addrLower = v.address.toLowerCase()
                await sql`INSERT OR REPLACE INTO users (address, username, duki_bps, karma, created_at, updated_at)
                    VALUES (${addrLower}, ${v.username}, ${v.dukiBps}, 1, ${now}, ${now})`.execute(db)
            }

            console.log(`[events-service] USER_MINTED: @${v.username} (${v.address}) dukiBps=${v.dukiBps}`)
            return { evtSeq: Number(evt.evtSeq), eventType: evt.evtType, username: v.username }
        }

        case EventType.USER_AMENDED: {
            const p = evt.data?.payload
            if (p?.case !== 'userAmended') throw new Error('USER_AMENDED: missing payload')
            const v = p.value

            const db = getKysely()
            if (db) {
                await db
                    .updateTable('users')
                    .set({
                        about: v.about || undefined,
                        email: v.email || undefined,
                        updated_at: now,
                    })
                    .where('address', '=', v.address)
                    .execute()
            }

            console.log(`[events-service] USER_AMENDED: ${v.address}`)
            return { evtSeq: Number(evt.evtSeq), eventType: evt.evtType }
        }

        // ─── Default ─────────────────────────────────────

        default:
            console.warn(`[events-service] Unhandled event type: ${evt.evtType}`)
            return { evtSeq: Number(evt.evtSeq), eventType: evt.evtType }
    }
}

// ─── Helpers ─────────────────────────────────────────────

async function ensureUser(address: string, username: string, now: number) {
    const db = getKysely()
    if (!db) return
    await sql`INSERT OR IGNORE INTO users (address, username, created_at, updated_at)
        VALUES (${address}, ${username}, ${now}, ${now})`.execute(db)
}


