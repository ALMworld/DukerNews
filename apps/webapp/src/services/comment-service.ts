/**
 * CommentService — type-safe Kysely queries, proto types from @repo/apidefs.
 * Consumed by both createServerFn and Server Routes.
 */

import { getKysely } from '../lib/db'
import { sql } from 'kysely'
import type { PbComment, PbEvent } from '@repo/apidefs'

// ─── Service Functions ───────────────────────────────────

/** Server-side page size for comments (configurable) */
const COMMENTS_PAGE_SIZE = 1000

export async function getComments(
    postId: bigint,
    opts?: { limit?: number; offset?: number },
): Promise<{ comments: PbComment[]; hasMore: boolean }> {
    const db = getKysely()
    if (!db) return { comments: [], hasMore: false }

    const limit = opts?.limit ?? COMMENTS_PAGE_SIZE
    const offset = opts?.offset ?? 0

    const rows = await db
        .selectFrom('comments')
        .selectAll()
        .where('post_id', '=', Number(postId) as any)  // D1 needs Number not bigint
        .where('dead', '=', 0)
        .orderBy('ancestor_path')
        .limit(limit + 1)  // fetch one extra to check hasMore
        .offset(offset)
        .execute()

    const hasMore = rows.length > limit
    const comments = (hasMore ? rows.slice(0, limit) : rows).map(mapDbComment)

    return { comments, hasMore }
}

export async function getRecentComments(limit: number = 40): Promise<PbComment[]> {
    const db = getKysely()
    if (!db) return []

    const rows = await db
        .selectFrom('comments as c')
        .innerJoin('posts as p', 'c.post_id', 'p.id')
        .select([
            'c.id',
            'c.post_id',
            'c.parent_id',
            'c.username',
            'c.text',
            'c.locale',
            'c.created_at',
            'p.title as post_title',
        ])
        .where('c.dead', '=', 0)
        .where('p.dead', '=', 0)
        .orderBy('c.created_at', 'desc')
        .limit(limit)
        .execute()

    return rows.map(
        (row): PbComment =>
            ({
                id: row.id,
                postId: row.post_id,
                parentId: row.parent_id ?? 0,
                username: row.username,
                text: row.text,
                locale: row.locale,
                createdAt: Number(row.created_at),
                postTitle: row.post_title,
            }) as unknown as PbComment,
    )
}

/** A user's comment with all its descendants as a flat list + post context */
export interface UserThread {
    /** Flat list: [rootComment, ...descendants] ordered by ancestor_path */
    comments: PbComment[]
    postId: bigint
    postTitle: string
    postLocale: string
}

export interface UserThreadsResult {
    threads: UserThread[]
    hasMore: boolean
    /** Comment ID to use as `next` cursor for the following page */
    nextCursor: bigint | null
}

const THREADS_PAGE_SIZE = 30

export async function getUserThreads(
    identifier: string,
    opts?: { limit?: number; next?: bigint },
): Promise<UserThreadsResult> {
    const db = getKysely()
    if (!db) return { threads: [], hasMore: false, nextCursor: null }

    const limit = opts?.limit ?? THREADS_PAGE_SIZE

    // 1. Get user's own comments (with post info), cursor-paginated
    let query = db
        .selectFrom('comments as c')
        .innerJoin('posts as p', 'c.post_id', 'p.id')
        .selectAll('c')
        .select(['p.title as post_title', 'p.locale as post_locale'])
        .where('c.dead', '=', 0)
        .where('p.dead', '=', 0)
        .where('c.username', '=', identifier)

    // Cursor: skip past the cursor comment (by created_at + id)
    if (opts?.next) {
        const cursorRow = await db
            .selectFrom('comments')
            .select(['created_at', 'id'])
            .where('id', '=', opts.next)
            .executeTakeFirst()
        if (cursorRow) {
            query = query.where((eb) =>
                eb.or([
                    eb('c.created_at', '<', cursorRow.created_at),
                    eb.and([
                        eb('c.created_at', '=', cursorRow.created_at),
                        eb('c.id', '>=', cursorRow.id),
                    ]),
                ])
            )
        }
    }

    const userRows = await query
        .orderBy('c.created_at', 'desc')
        .limit(limit + 1)  // fetch one extra to check hasMore
        .execute()

    const hasMore = userRows.length > limit
    const pageRows = hasMore ? userRows.slice(0, limit) : userRows

    if (pageRows.length === 0) return { threads: [], hasMore: false, nextCursor: null }

    // 2. For each user comment, fetch descendants as a flat list ordered by path
    const threads: UserThread[] = []

    for (const row of pageRows) {
        const rootComment = mapDbComment(row)

        // Descendants: comments whose path starts with this comment's path + '.'
        const descRows = await db
            .selectFrom('comments')
            .selectAll()
            .where('post_id', '=', row.post_id)
            .where('dead', '=', 0)
            .where('ancestor_path', 'like', `${row.ancestor_path}.%`)
            .orderBy('ancestor_path')
            .execute()

        threads.push({
            comments: [rootComment, ...descRows.map(mapDbComment)],
            postId: row.post_id,
            postTitle: row.post_title,
            postLocale: row.post_locale,
        })
    }

    // Next cursor = last comment's ID on this page
    const lastComment = pageRows[pageRows.length - 1]
    const nextCursor = hasMore ? lastComment.id : null

    return { threads, hasMore, nextCursor }
}

export async function addComment(evt: PbEvent): Promise<PbComment> {
    const p = evt.data?.payload
    if (p?.case !== 'commentCreated') throw new Error('addComment: expected commentCreated payload')

    const db = getKysely()
    if (!db) throw new Error('Database not available — cannot add comment without D1')

    const v = p.value

    const now = Date.now()
    // D1 doesn't support bigint — convert at persistence boundary
    const commentId = Number(evt.aggId)
    const postId = Number(v.postId)
    const parentId = Number(v.parentId)
    const ancestorPath = v.ancestorPath
    // Depth = number of ancestors (ancestor_path segments)
    const depth = ancestorPath?.length ? ancestorPath.split('.').length : 0

    // Ensure user exists (FK: comments.username → users.username)
    const upsertUsername = evt.username
    await sql`INSERT OR IGNORE INTO users (address, username, created_at, updated_at)
               VALUES ('', ${upsertUsername}, ${now}, ${now})`.execute(db)

    await db
        .insertInto('comments')
        .values({
            id: commentId as any,
            post_id: postId as any,
            username: evt.username,
            text: v.text,
            locale: v.locale,
            parent_id: (parentId || null) as any,
            ancestor_path: ancestorPath,  // ancestors-only
            depth,
            points: 1,
            boost_amount: Number(v.boostAmount ?? 0),
            total_boost: Number(v.boostAmount ?? 0),
            created_at: now,
        })
        .executeTakeFirstOrThrow()

    // Increment post comment_count
    await db
        .updateTable('posts')
        .set({ comment_count: (eb) => eb('comment_count', '+', 1) })
        .where('id', '=', postId as any)
        .execute()

    return {
        id: commentId,
        postId: postId,
        parentId: parentId,
        username: evt.username,
        text: v.text,
        locale: v.locale,
        ancestorPath: ancestorPath,
        depth,
        points: 1,
        dead: false,
        boostAmount: Number(v.boostAmount ?? 0),
        totalBoost: Number(v.boostAmount ?? 0),
        createdAt: now,
    } as unknown as PbComment
}

export async function amendComment(commentId: bigint, text: string): Promise<void> {
    const db = getKysely()
    if (!db) throw new Error('Database not available')
    const id = Number(commentId)

    await db
        .updateTable('comments')
        .set({ text })
        .where('id', '=', id as any)
        .execute()
}

export async function deleteComment(commentId: bigint): Promise<void> {
    const db = getKysely()
    if (!db) throw new Error('Database not available')
    const id = Number(commentId)

    // Get the postId before deleting
    const comment = await db
        .selectFrom('comments')
        .select(['post_id'])
        .where('id', '=', id as any)
        .executeTakeFirst()

    // Soft-delete: set dead = 1
    await db
        .updateTable('comments')
        .set({ dead: 1 })
        .where('id', '=', id as any)
        .execute()

    // Decrement post comment_count
    if (comment) {
        await db
            .updateTable('posts')
            .set({ comment_count: (eb) => eb('comment_count', '-', 1) })
            .where('id', '=', comment.post_id)
            .execute()
    }
}

// ─── DB row mapping ──────────────────────────────────────

function mapDbComment(row: any): PbComment {
    return {
        id: row.id,
        postId: row.post_id,
        parentId: row.parent_id ?? 0,
        username: row.username,
        text: row.text,
        locale: row.locale,
        ancestorPath: row.ancestor_path,
        depth: row.depth,
        points: row.points ?? 1,
        dead: (row.dead ?? 0) !== 0,
        boostAmount: row.boost_amount ?? 0,
        totalBoost: row.total_boost ?? 0,
        createdAt: Number(row.created_at),
    } as unknown as PbComment
}
