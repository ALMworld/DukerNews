/**
 * PostService — type-safe Kysely queries, proto types from @repo/apidefs.
 * Consumed by both createServerFn and Server Routes.
 */

import { getKysely } from '../lib/db'
import type { PbPost, PbComment, PbGetPostsResp, PbPostData } from '@repo/apidefs'
import { PostKind, PbPostDataSchema, PbPostSchema } from '@repo/apidefs'
import { create, toBinary, fromBinary } from '@bufbuild/protobuf'
import { sql } from 'kysely'
import * as InteractionService from './interaction-service'
import * as CommentService from './comment-service'
import { scoreSqlExpr } from '../lib/ranking'

// ─── Input Types ─────────────────────────────────────────

export interface GetPostsInput {
    kind?: PostKind
    page?: number
    perPage?: number
    sort?: 'points' | 'newest' | 'conviction'
    q?: string
    nextCursor?: number
    address?: string
    /** Time window for conviction sort (days). Default: 64 */
    window?: number
}

export interface CreatePostInput {
    /** On-chain aggId — used as the explicit DB id to keep them in sync */
    aggId: bigint
    title: string
    url?: string
    text?: string
    titleEn?: string
    urlEn?: string
    textEn?: string
    kind: PostKind
    locale: string
    address: string
    username: string
    postData?: any  // PbPostData (serialized to BLOB)
}

export interface UpvotePostInput {
    postId: bigint
    address: string
    /** Boost amount in USDT micro-units (6 decimals). 0 = free upvote. */
    boostAmount?: bigint
}

// ─── Service Functions ───────────────────────────────────

export async function getPosts(input: GetPostsInput): Promise<PbGetPostsResp> {
    const db = getKysely()
    if (!db) return { posts: [], total: 0, nextCursor: 0 } as unknown as PbGetPostsResp

    try {
        const perPage = input.perPage ?? 30
        const page = input.page ?? 1
        const offset = (page - 1) * perPage

        // Build count query
        let countQuery = db
            .selectFrom('posts')
            .select(db.fn.countAll<number>().as('cnt'))
            .where('dead', '=', 0)

        // Build data query
        let dataQuery = db
            .selectFrom('posts')
            .selectAll()
            .where('dead', '=', 0)

        if (input.kind != null && input.kind !== 0) {
            countQuery = countQuery.where('kind', '=', String(input.kind))
            dataQuery = dataQuery.where('kind', '=', String(input.kind))
        }

        if (input.q) {
            countQuery = countQuery.where('title', 'like', `%${input.q}%`)
            dataQuery = dataQuery.where('title', 'like', `%${input.q}%`)
        }

        // Get total count (before window filter — conviction re-counts after)
        const countResult = await countQuery.executeTakeFirst()

        // Apply time window filter for conviction sort
        if (input.sort === 'conviction' && input.window) {
            const windowMs = Date.now() - input.window * 24 * 60 * 60 * 1000
            countQuery = countQuery.where('created_at', '>=', windowMs)
            dataQuery = dataQuery.where('created_at', '>=', windowMs)
        }

        // Re-execute count after window filter for conviction sort
        const countResult2 = input.sort === 'conviction'
            ? await countQuery.executeTakeFirst()
            : null

        const total = Number((countResult2 as any)?.cnt ?? (countResult as any)?.cnt ?? 0)

        // Get paginated rows with appropriate sort
        let rows
        if (input.sort === 'conviction') {
            // /top page: pure total_boost DESC — fallback to points if column missing
            try {
                rows = await dataQuery
                    .orderBy('total_boost', 'desc')
                    .orderBy('created_at', 'desc')
                    .limit(perPage).offset(offset).execute()
            } catch {
                rows = await dataQuery
                    .orderBy('points', 'desc')
                    .orderBy('created_at', 'desc')
                    .limit(perPage).offset(offset).execute()
            }
        } else if (input.sort === 'points') {
            // Homepage: time-decay score with boost-adjusted gravity
            // Falls back to points DESC if pow()/total_boost unavailable
            try {
                const scoreExpr = scoreSqlExpr(Date.now())
                rows = await dataQuery
                    .orderBy(sql.raw(scoreExpr), 'desc')
                    .limit(perPage).offset(offset).execute()
            } catch {
                rows = await dataQuery
                    .orderBy('points', 'desc')
                    .orderBy('created_at', 'desc')
                    .limit(perPage).offset(offset).execute()
            }
        } else {
            // /newest: chronological
            rows = await dataQuery
                .orderBy('created_at', 'desc')
                .limit(perPage).offset(offset).execute()
        }

        const posts = rows.map(mapDbPost)

        // nextCursor: last post ID if there are more pages
        const hasMore = offset + posts.length < total
        const nextCursor = hasMore && posts.length > 0
            ? (posts[posts.length - 1] as any).id
            : 0

        return {
            posts,
            total,
            nextCursor,
        } as unknown as PbGetPostsResp
    } catch (err) {
        console.error('[getPosts] Error:', err)
        return { posts: [], total: 0, nextCursor: 0 } as unknown as PbGetPostsResp
    }
}

export async function getPost(id: bigint): Promise<PbPost | null> {
    const db = getKysely()
    if (!db) return null

    const row = await db
        .selectFrom('posts')
        .selectAll()
        .where('id', '=', Number(id) as any)  // D1 needs Number not bigint
        .where('dead', '=', 0)
        .executeTakeFirst()

    return row ? mapDbPost(row) : null
}

/** SSR limits */
const LIMIT_NORMAL = 1000
const LIMIT_BOT = 10000

export interface GetPostAggInput {
    id: bigint
    commentLimit?: number
    isBot?: boolean
}

export interface PostAggResult {
    post: PbPost | null
    comments: PbComment[]
    hasMore: boolean
}

export async function getPostAgg(input: GetPostAggInput): Promise<PostAggResult> {
    const limit = input.commentLimit || (input.isBot ? LIMIT_BOT : LIMIT_NORMAL)
    const [post, { comments, hasMore }] = await Promise.all([
        getPost(input.id),
        CommentService.getComments(input.id, { limit }),
    ])
    return { post, comments, hasMore }
}

export async function createPost(input: CreatePostInput): Promise<PbPost> {
    const db = getKysely()
    if (!db) throw new Error('Database not available — cannot create post without D1')

    try {
        const now = Date.now()
        const domain = input.url ? extractDomain(input.url) : ''

        // Ensure user exists (FK: posts.address → users.address)
        await sql`INSERT OR IGNORE INTO users (address, username, created_at, updated_at)
                   VALUES (${input.address}, ${input.username}, ${now}, ${now})`.execute(db)

        // Serialize postData to binary blob if provided
        let postDataBlob: Uint8Array | null = null
        if (input.postData) {
            const pd = create(PbPostDataSchema, {
                payload: input.postData,
            })
            postDataBlob = toBinary(PbPostDataSchema, pd)
        }

        // Insert the post with the on-chain aggId as the explicit id
        // This keeps post.id in sync with the aggId referred to by comments and boosts
        await db
            .insertInto('posts')
            .values({
                id: Number(input.aggId) as any,  // D1 INTEGER needs Number, not BigInt
                username: input.username,
                title: input.title,
                url: input.url || '',
                domain,
                text: input.text || '',
                title_en: input.titleEn || '',
                url_en: input.urlEn || '',
                text_en: input.textEn || '',
                kind: String(input.kind),
                locale: input.locale,
                post_data: postDataBlob,
                boost_amount: 0,
                total_boost: 0,
                points: 1,
                comment_count: 0,
                created_at: now,
                updated_at: now,
            })
            .execute()

        // Get the last inserted row by matching unique fields
        const inserted = await db
            .selectFrom('posts')
            .selectAll()
            .where('username', '=', input.username)
            .where('created_at', '=', now)
            .orderBy('id', 'desc')
            .executeTakeFirst()

        const id = inserted?.id ?? 0

        // Build plain JSON postData for the return value
        let returnPostData: any = undefined
        if (input.postData?.works) {
            returnPostData = { works: input.postData.works }
        } else if (input.postData?.voice) {
            returnPostData = { voice: {} }
        }

        return {
            id,
            address: input.address,
            username: input.username,
            title: input.title,
            url: input.url || '',
            domain,
            text: input.text || '',
            kind: input.kind,
            locale: input.locale,
            points: 1,
            commentCount: 0,
            flags: 0,
            dead: false,
            latestEvtSeq: 0,
            createdAt: now,
            updatedAt: now,
            postData: returnPostData,
        } as unknown as PbPost
    } catch (err: any) {
        throw err
    }
}

export async function upvotePost(input: UpvotePostInput): Promise<PbPost | null> {
    const db = getKysely()
    if (!db) throw new Error('Database not available — cannot upvote without D1')

    // D1 doesn't support bigint — convert at DB boundary
    const postIdNum = Number(input.postId)

    // Look up username from address
    const user = await db
        .selectFrom('users')
        .select('username')
        .where('address', '=', input.address)
        .executeTakeFirst()
    if (!user) return null

    // Check for existing upvote
    const currentVote = await InteractionService.getVote(user.username, InteractionService.AggType.POST, BigInt(postIdNum))
    if (currentVote === InteractionService.VOTE_UP) return null

    // Set upvote
    await InteractionService.setVote(user.username, InteractionService.AggType.POST, BigInt(postIdNum), InteractionService.VOTE_UP)

    // Increment points and accumulate boost
    await db
        .updateTable('posts')
        .set({
            points: sql`points + 1`,
            total_boost: sql`COALESCE(total_boost, 0) + ${Number(input.boostAmount ?? 0)}`,
        })
        .where('id', '=', postIdNum as any)
        .execute()

    return await getPost(BigInt(postIdNum))
}

// ─── Helpers ─────────────────────────────────────────────

function extractDomain(url: string): string {
    try {
        return new URL(url).hostname.replace('www.', '')
    } catch {
        return ''
    }
}

// ─── DB row mapping ──────────────────────────────────────

function mapDbPost(row: any): PbPost {
    // Deserialize post_data blob — real proto message via fromBinary
    let postData: PbPostData | undefined = undefined
    if (row.post_data) {
        try {
            let bytes: Uint8Array
            if (row.post_data instanceof Uint8Array) {
                bytes = row.post_data
            } else if (row.post_data instanceof ArrayBuffer) {
                bytes = new Uint8Array(row.post_data)
            } else if (Array.isArray(row.post_data)) {
                bytes = new Uint8Array(row.post_data)
            } else {
                bytes = new Uint8Array(Object.values(row.post_data) as number[])
            }
            postData = fromBinary(PbPostDataSchema, bytes) as PbPostData
        } catch (err) {
            console.error('[mapDbPost] Failed to deserialize post_data:', err)
        }
    }

    return create(PbPostSchema, {
        id: row.id,
        address: row.address,
        username: row.username,
        title: row.title,
        url: row.url || '',
        domain: row.domain || '',
        text: row.text || '',
        titleEn: row.title_en || '',
        urlEn: row.url_en || '',
        textEn: row.text_en || '',
        kind: Number(row.kind) as PostKind,
        locale: row.locale,
        points: row.points ?? 1,
        commentCount: row.comment_count ?? 0,
        flags: row.flags ?? 0,
        dead: (row.dead ?? 0) !== 0,
        boostAmount: row.boost_amount ?? 0,
        totalBoost: row.total_boost ?? 0,
        latestEvtSeq: BigInt(row.latest_evt_seq ?? 0),
        createdAt: BigInt(row.created_at),
        updatedAt: BigInt(row.updated_at),
        postData,
    }) as PbPost
}
