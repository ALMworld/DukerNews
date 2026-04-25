/**
 * seed-service.ts — Event-based HN data seeding.
 *
 * Two-phase approach that tests the event system:
 *   1. algoliaToEvents(): Parse Algolia HN JSON → PbEvent[] (pure data transform)
 *   2. testApplyEvents(): Take PbEvent[] → insert into DB (tests event sufficiency)
 *
 * This validates that events carry all necessary data to reconstruct state.
 */

import { getKysely } from '../lib/db'
import { sql } from 'kysely'
import { create, toBinary } from '@bufbuild/protobuf'
import {
    EventType,
    PostKind,
    DukiType,
    ProductType,
    PbEventSchema,
    PbPostDataSchema,
    WorksPostDataSchema,
    type PbEvent,
} from '@repo/dukernews-apidefs'

// ─── Fake Works Data ─────────────────────────────────────

const TAG_POOL = [
    'ai', 'web3', 'oss', 'defi', 'dao', 'nft', 'sustainability',
    'education', 'healthcare', 'fintech', 'climate', 'robotics',
    'privacy', 'infra', 'gaming', 'social', 'devtools', 'data',
]

/** Simple seeded PRNG (mulberry32) for reproducible fake data */
function seededRandom(seed: number) {
    let t = seed + 0x6D2B79F5
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}


// ─── Algolia Types ───────────────────────────────────────

interface AlgoliaItem {
    id: number
    author: string | null
    title: string | null
    url: string | null
    text: string | null
    points: number | null
    type: string
    created_at_i: number  // unix seconds
    children: AlgoliaItem[]
}

// ─── Helpers ─────────────────────────────────────────────

function extractDomain(url: string): string {
    try { return new URL(url).hostname.replace('www.', '') }
    catch { return '' }
}

/**
 * Generate a deterministic 0x wallet address from a username.
 * Uses a simple hash so the same username always gets the same address.
 */
function usernameToAddress(username: string): string {
    let hash = 0
    for (let i = 0; i < username.length; i++) {
        hash = ((hash << 5) - hash + username.charCodeAt(i)) | 0
    }
    // Pad to 40 hex chars (20 bytes) with the username embedded
    const hexHash = Math.abs(hash).toString(16).padStart(8, '0')
    const hexName = Array.from(username)
        .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 32)
    return '0x' + hexHash + hexName.padEnd(32, '0')
}

function stripHtml(html: string): string {
    return html
        .replace(/<p>/gi, '\n\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<a\s+href="([^"]*)"[^>]*>[^<]*<\/a>/gi, '$1')
        .replace(/<\/?[^>]+(>|$)/g, '')
        .replace(/&gt;/g, '>').replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/')
        .trim()
}

// ─── Phase 1: Algolia JSON → PbEvent[] ──────────────────

/**
 * Convert an Algolia HN item tree into a flat array of PbEvent[].
 * Event IDs use HN IDs as temporary placeholders — testApplyEvents
 * will remap them to actual DB IDs.
 */
export function algoliaToEvents(item: AlgoliaItem, maxComments: number = 200): PbEvent[] {
    const events: PbEvent[] = []

    const author = item.author || 'anonymous'
    const authorAddress = usernameToAddress(author)
    const title = item.title || '(untitled)'
    const url = item.url || ''
    const text = item.text ? stripHtml(item.text) : ''
    const domain = url ? extractDomain(url) : ''
    const kind = url ? PostKind.WORKS : PostKind.VOICE
    // Make ~half of URL posts into Works posts with fake data
    const isWorksPost = kind === PostKind.WORKS && (item.id % 2 === 0)
    const evtTime = BigInt(item.created_at_i * 1000) // HN seconds → ms

    // POST_CREATED event — use hn item id as placeholder
    events.push(create(PbEventSchema, {
        evtSeq: 0n,
        address: authorAddress,
        username: author,
        evtType: EventType.POST_CREATED,
        evtTime,
        data: {
            payload: {
                case: 'postCreated',
                value: {
                    id: item.id,  // HN id as temp placeholder
                    title,
                    url,
                    text,
                    kind,
                    locale: 'en',
                    domain,
                    points: item.points ?? 1,
                    postData: isWorksPost
                        ? create(PbPostDataSchema, {
                            payload: {
                                case: 'works' as const,
                                value: create(WorksPostDataSchema, {
                                    dukiType: seededRandom(item.id) > 0.5 ? DukiType.REVENUE_SHARE : DukiType.PROFIT_SHARE,
                                    dukiValues: [Math.round((0.5 + seededRandom(item.id) * 9.5) * 100)],
                                    dukiPledgeUrl: `https://dao.example.org/project/${item.id}`,
                                    daoContractAddress: seededRandom(item.id) > 0.7
                                        ? `0x${item.id.toString(16).padStart(40, 'a')}`
                                        : '',
                                    productType: [ProductType.DIGITAL, ProductType.PHYSICAL, ProductType.SERVICE][Math.floor(seededRandom(item.id + 3) * 3)],
                                    productTags: (() => {
                                        const r3 = seededRandom(item.id + 2)
                                        const tagCount = 1 + Math.floor(r3 * 3)
                                        const t: string[] = []
                                        for (let i = 0; i < tagCount; i++) {
                                            const idx = Math.floor(seededRandom(item.id + 10 + i) * TAG_POOL.length)
                                            if (!t.includes(TAG_POOL[idx])) t.push(TAG_POOL[idx])
                                        }
                                        return t
                                    })(),
                                }),
                            },
                        })
                        : undefined,
                },
            },
        },
    }))

    // COMMENT_CREATED events — DFS walk
    let commentCount = 0

    function walkComments(children: AlgoliaItem[], parentHnId: number, depth: number) {
        for (const child of children) {
            if (commentCount >= maxComments) return
            if (!child.author || !child.text) continue

            const commentText = stripHtml(child.text)
            if (!commentText) continue

            const commentEvtTime = BigInt(child.created_at_i * 1000)
            const commentAuthor = child.author!
            const commentAddress = usernameToAddress(commentAuthor)

            events.push(create(PbEventSchema, {
                evtSeq: 0n,
                address: commentAddress,
                username: commentAuthor,
                evtType: EventType.COMMENT_CREATED,
                evtTime: commentEvtTime,
                data: {
                    payload: {
                        case: 'commentCreated',
                        value: {
                            id: child.id,         // HN comment id (temp)
                            postId: item.id,       // HN story id (temp)
                            parentId: parentHnId,  // HN parent id (temp, 0 for top-level)
                            text: commentText,
                            locale: 'en',
                            ancestorPath: '',  // will be computed during apply
                            depth,
                            points: 1,
                        },
                    },
                },
            }))

            commentCount++

            // Recurse
            walkComments(child.children || [], child.id, depth + 1)
        }
    }

    walkComments(item.children || [], 0, 1)

    return events
}

// ─── Phase 2: PbEvent[] → Database ──────────────────────

interface ApplyResult {
    postId: number
    commentsImported: number
    eventsProcessed: number
    skipped?: boolean
}

/**
 * Apply a list of PbEvent[] to the database.
 * Handles POST_CREATED and COMMENT_CREATED events.
 *
 * Since event IDs use HN ids as placeholders, this function maintains
 * an ID remap table (hnId → dbId) for linking comments to their parents.
 */
export async function testApplyEvents(events: PbEvent[]): Promise<ApplyResult> {
    const db = getKysely()
    if (!db) throw new Error('Database not available')

    // HN id → DB id remap
    const idMap = new Map<number, number>()
    let postId = 0
    let commentsImported = 0

    for (const evt of events) {
        const payload = evt.data?.payload
        if (!payload) continue

        switch (evt.evtType) {
            case EventType.POST_CREATED: {
                if (payload.case !== 'postCreated') break
                const v = payload.value
                const author = evt.address
                const evtTime = Number(evt.evtTime)

                // Dedup: check if post with same title + author exists
                const existing = await db.selectFrom('posts').select('id')
                    .where('title', '=', v.title)
                    .where('username', '=', evt.username)
                    .executeTakeFirst()
                if (existing) {
                    return { postId: existing.id, commentsImported: 0, eventsProcessed: 0, skipped: true }
                }

                // Upsert author
                await sql`INSERT OR IGNORE INTO users (address, username, created_at, updated_at)
                           VALUES (${author}, ${evt.username}, ${evtTime}, ${evtTime})`.execute(db)

                // Serialize post_data blob if present
                let postDataBlob: Uint8Array | null = null
                if (v.postData) {
                    try {
                        postDataBlob = toBinary(PbPostDataSchema, v.postData)
                    } catch { /* ignore */ }
                }

                // Insert post
                await db.insertInto('posts').values({
                    username: evt.username,
                    title: v.title,
                    url: v.url,
                    domain: v.domain,
                    text: v.text,
                    title_en: '',
                    url_en: '',
                    text_en: '',
                    kind: String(v.kind),
                    locale: v.locale,
                    points: v.points,
                    post_data: postDataBlob,
                    comment_count: 0,
                    created_at: evtTime,
                    updated_at: evtTime,
                }).execute()

                // Get assigned DB id
                const row = await db.selectFrom('posts').select('id')
                    .where('username', '=', evt.username)
                    .where('created_at', '=', evtTime)
                    .orderBy('id', 'desc')
                    .executeTakeFirst()

                postId = row?.id ?? 0
                idMap.set(v.id, postId)  // map HN story id → DB post id

                // Also insert event into events table
                await db.insertInto('events').values({
                    address: author,
                    username: evt.username,
                    evt_type: EventType.POST_CREATED,
                    evt_time: evtTime,
                    payload: null,
                    created_at: evtTime,
                }).execute()

                break
            }

            case EventType.COMMENT_CREATED: {
                if (payload.case !== 'commentCreated') break
                const v = payload.value
                const author = evt.address
                const evtTime = Number(evt.evtTime)

                // Resolve parent: 0 means top-level, otherwise look up remap
                const dbParentId = v.parentId === 0 ? null : (idMap.get(v.parentId) ?? null)

                // Upsert author
                await sql`INSERT OR IGNORE INTO users (address, username, created_at, updated_at)
                           VALUES (${author}, ${evt.username}, ${evtTime}, ${evtTime})`.execute(db)

                // Insert comment
                const result = await db.insertInto('comments').values({
                    post_id: postId,
                    username: evt.username,
                    text: v.text,
                    locale: v.locale,
                    parent_id: dbParentId,
                    ancestor_path: '',
                    depth: v.depth,
                    points: v.points,
                    created_at: evtTime,
                }).executeTakeFirstOrThrow()

                const newId = Number(result.insertId)
                idMap.set(v.id, newId)  // map HN comment id → DB comment id

                // Build materialized path (ancestors only — does NOT include self)
                // Root comments: path = ""
                // Replies: path = parent.path + "." + dbParentId  (add parent to chain)
                let finalPath = ''
                if (dbParentId) {
                    const parent = await db.selectFrom('comments').select('ancestor_path')
                        .where('id', '=', dbParentId)
                        .executeTakeFirst()
                    finalPath = parent?.ancestor_path
                        ? `${parent.ancestor_path}.${dbParentId}`
                        : String(dbParentId)
                }

                await db.updateTable('comments')
                    .set({ ancestor_path: finalPath })
                    .where('id', '=', newId)
                    .execute()

                // Insert event
                await db.insertInto('events').values({
                    address: author,
                    username: evt.username,
                    evt_type: EventType.COMMENT_CREATED,
                    evt_time: evtTime,
                    payload: null,
                    created_at: evtTime,
                }).execute()

                commentsImported++
                break
            }
        }
    }

    // Update post comment_count
    if (postId > 0 && commentsImported > 0) {
        await db.updateTable('posts')
            .set({ comment_count: commentsImported })
            .where('id', '=', postId)
            .execute()
    }

    return { postId, commentsImported, eventsProcessed: events.length }
}
