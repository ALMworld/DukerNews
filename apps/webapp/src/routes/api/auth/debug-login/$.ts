/**
 * /api/auth/debug-login/{username} — DEV-ONLY debug endpoint.
 *
 * GET /api/auth/debug-login/thanks
 *   → Logs in as "thanks", sets cookie, redirects to homepage.
 *
 * GET /api/auth/debug-login/thanks/append_100_comments
 *   → Logs in as "thanks" AND inserts 100 random comments from that user.
 *
 * ⚠️  Only available when import.meta.env.DEV is true.
 */

import { createFileRoute } from '@tanstack/react-router'
import { getKysely } from '../../../../lib/db'
import { signJwt, buildCookieHeader, getJwtExpirySecs } from '../../../../server/auth-utils'
import { sql } from 'kysely'

// ─── Fake comment text pool ─────────────────────────────
const COMMENT_POOL = [
    "Great point! I've been thinking about this too.",
    "This reminds me of a similar discussion on Lobste.rs last week.",
    "I think the real issue is more nuanced than the article suggests.",
    "Has anyone tried implementing this with Rust? I'd be curious about performance.",
    "The documentation for this is surprisingly good, worth checking out.",
    "I'm skeptical about the long-term viability of this approach.",
    "We switched to this at my company and it's been a game changer.",
    "Interesting perspective. I wonder how this scales with larger teams.",
    "This is exactly the kind of thing that makes HN great.",
    "I've seen this pattern before — it usually doesn't end well.",
    "The author makes a compelling argument, but misses the key trade-off.",
    "We need more posts like this. Clear, concise, and actionable.",
    "I'd love to see a follow-up that covers the edge cases.",
    "This worked for us in production for over two years now.",
    "The comments here are more insightful than the article itself.",
    "I disagree with the premise, but the execution is solid.",
    "Anyone know of an open-source alternative to what's described here?",
    "This is one of those things that seems obvious in hindsight.",
    "The performance implications of this are often overlooked.",
    "I wrote a blog post about this exact topic last month.",
    "The key insight is buried in paragraph 5 — don't miss it.",
    "This confirms what I suspected about modern web development.",
    "Nice analysis. Would love to see the raw data behind this.",
    "I've been using this technique for years — glad to see it getting attention.",
    "The trade-offs mentioned here are real and shouldn't be dismissed.",
    "This is why I love the open source community.",
    "Solid engineering. The attention to detail is impressive.",
    "I think this will become the standard approach within 2-3 years.",
    "Worth noting that this doesn't work well with legacy systems.",
    "The author clearly has deep experience with this domain.",
]

/** Simple seeded PRNG for reproducible results */
function seededRand(seed: number): number {
    let t = seed + 0x6D2B79F5
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const Route = createFileRoute('/api/auth/debug-login/$')({
    server: {
        handlers: {
            GET: async ({ request }) => {
                // Block in production
                if (!import.meta.env.DEV) {
                    return Response.json(
                        { error: 'Debug login is only available in development' },
                        { status: 403 }
                    )
                }

                try {
                    const url = new URL(request.url)
                    // Extract path after /api/auth/debug-login/
                    const rawPath = url.pathname.replace(/^\/api\/auth\/debug-login\//, '')
                    const segments = rawPath.split('/').filter(Boolean)
                    const username = segments[0] || ''
                    const action = segments[1] || ''

                    if (!username) {
                        return Response.json(
                            { error: 'Usage: GET /api/auth/debug-login/{username}[/append_100_comments]' },
                            { status: 400 }
                        )
                    }

                    const db = getKysely()
                    if (!db) {
                        return Response.json(
                            { error: 'Database not available' },
                            { status: 500 }
                        )
                    }

                    // Look up user by username or address
                    let row = await db
                        .selectFrom('users')
                        .selectAll()
                        .where('username', '=', username)
                        .executeTakeFirst()

                    if (!row) {
                        row = await db
                            .selectFrom('users')
                            .selectAll()
                            .where('address', '=', username)
                            .executeTakeFirst()
                    }

                    // For append_100_comments: auto-create user if not found
                    if (!row && action === 'append_100_comments') {
                        const now = Date.now()
                        const fakeAddress = '0x' + Array.from(username)
                            .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
                            .join('').padEnd(40, '0').slice(0, 40)
                        await sql`INSERT OR IGNORE INTO users (address, username, created_at, updated_at)
                                   VALUES (${fakeAddress}, ${username}, ${now}, ${now})`.execute(db)
                        row = await db
                            .selectFrom('users')
                            .selectAll()
                            .where('username', '=', username)
                            .executeTakeFirst()
                    }

                    if (!row) {
                        return Response.json(
                            { error: `User "${username}" not found` },
                            { status: 404 }
                        )
                    }

                    // ─── Handle append_100_comments action ────────────
                    if (action === 'append_100_comments') {
                        return await handleAppendComments(db, row, 100)
                    }

                    // ─── Normal debug login ───────────────────────────
                    // Sign JWT
                    const expireAt = Math.floor(Date.now() / 1000) + getJwtExpirySecs()
                    const token = await signJwt({
                        ego: row.address,
                        chainId: '1',
                        username: row.username,
                        expireAt,
                    })

                    // Set cookie, clear stale client-side auth store, and redirect to homepage
                    const html = `<!DOCTYPE html><html><body>
                        <script>
                            localStorage.removeItem('duker-auth-storage');
                            window.location.href = '/';
                        </script>
                        <p>Logged in as "${row.username}" — redirecting...</p>
                    </body></html>`

                    return new Response(html, {
                        status: 200,
                        headers: {
                            'Content-Type': 'text/html',
                            'Set-Cookie': buildCookieHeader(token),
                        },
                    })
                } catch (error) {
                    console.error('Debug login error:', error)
                    return Response.json(
                        { error: error instanceof Error ? error.message : 'Unknown error' },
                        { status: 500 }
                    )
                }
            },
        },
    },
})

/**
 * Add N random comments from a user across random posts.
 * Each comment goes on a different post (as a top-level comment).
 */
async function handleAppendComments(db: any, user: any, count: number) {
    // Get all post IDs
    const posts = await db
        .selectFrom('posts')
        .select(['id', 'title'])
        .where('dead', '=', 0)
        .execute()

    if (posts.length === 0) {
        return Response.json({ error: 'No posts found to comment on' }, { status: 400 })
    }

    const now = Date.now()
    let inserted = 0

    // Ensure user exists
    await sql`INSERT OR IGNORE INTO users (address, username, created_at, updated_at)
               VALUES (${user.address}, ${user.username}, ${now}, ${now})`.execute(db)

    // Pick up to `count` random posts (with possible repeats if fewer posts)
    for (let i = 0; i < count; i++) {
        const idx = Math.floor(seededRand(now + i) * posts.length)
        const post = posts[idx]
        const commentText = COMMENT_POOL[Math.floor(seededRand(now + i + 1000) * COMMENT_POOL.length)]
        const commentTime = now - Math.floor(seededRand(now + i + 2000) * 7 * 24 * 3600 * 1000) // random within last 7 days

        try {
            const result = await db.insertInto('comments').values({
                post_id: post.id,
                address: user.address,
                username: user.username,
                text: commentText,
                locale: 'en',
                parent_id: null,
                path: '',
                depth: 0,
                points: 1,
                created_at: commentTime,
            }).executeTakeFirstOrThrow()

            const newId = Number(result.insertId)

            // Set path to self (top-level)
            await db.updateTable('comments')
                .set({ path: String(newId) })
                .where('id', '=', newId)
                .execute()

            // Increment post comment_count
            await db.updateTable('posts')
                .set({ comment_count: sql`comment_count + 1` })
                .where('id', '=', post.id)
                .execute()

            inserted++
        } catch (err) {
            console.error(`Failed to insert comment on post #${post.id}:`, err)
        }
    }

    return Response.json({
        ok: true,
        user: user.username,
        commentsInserted: inserted,
        message: `Added ${inserted} comments from "${user.username}" across random posts`,
    })
}

