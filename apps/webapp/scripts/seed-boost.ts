/**
 * seed-boost.ts — Set graduated total_boost values on mock posts and comments.
 *
 * Run AFTER seed-mock.ts has populated the DB:
 *   npx tsx scripts/seed-boost.ts
 *
 * Boost values are in micro-USDT (6 decimals), so:
 *   $1   = 1_000_000
 *   $22  = 22_000_000
 *   $100 = 100_000_000
 */

import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import { resolve } from 'path'

// Wrangler D1 miniflare path (glob for the hash-named file)
import { readdirSync } from 'fs'

const WRANGLER_D1_DIR = resolve(process.cwd(), '.wrangler/state/v3/d1/miniflare-D1DatabaseObject')

const DB_PATHS = [
    resolve(process.cwd(), '.palace/db.sqlite'),
    resolve(process.cwd(), 'palace.sqlite'),
    // Wrangler D1 miniflare: find the .sqlite file dynamically
    ...(existsSync(WRANGLER_D1_DIR)
        ? readdirSync(WRANGLER_D1_DIR)
            .filter(f => f.endsWith('.sqlite'))
            .map(f => resolve(WRANGLER_D1_DIR, f))
        : []),
]

function findDb(): string {
    for (const p of DB_PATHS) {
        if (existsSync(p)) return p
    }
    throw new Error(`Could not find DB. Tried:\n${DB_PATHS.join('\n')}`)
}

// Graduated USDT boost amounts in micro-units
const USD_LEVELS = [0, 1, 2, 10, 22, 100, 1000]

/** Convert dollars → micro-units */
const toMicro = (usd: number) => usd * 1_000_000

function main() {
    const dbPath = findDb()
    console.log(`📦 Using DB: ${dbPath}\n`)
    const db = new Database(dbPath)

    // Get the mock posts ordered by id (they're inserted sequentially)
    const posts = db.prepare(
        `SELECT id FROM posts WHERE title LIKE '[MOCK]%' ORDER BY id ASC LIMIT 8`
    ).all() as { id: number }[]

    if (posts.length === 0) {
        console.log('❌ No [MOCK] posts found — run seed-mock.ts first')
        process.exit(1)
    }

    console.log(`Found ${posts.length} mock posts. Assigning boost tiers:\n`)

    const updatePost = db.prepare(`UPDATE posts SET total_boost = ? WHERE id = ?`)

    for (let i = 0; i < posts.length; i++) {
        const post = posts[i]
        const usd = USD_LEVELS[i % USD_LEVELS.length]
        const micro = toMicro(usd)
        updatePost.run(micro, post.id)
        console.log(`  Post #${post.id} → $${usd} (${micro} micro)`)

        // Also update some comments for this post with graduated boosts
        const comments = db.prepare(
            `SELECT id FROM comments WHERE post_id = ? ORDER BY id ASC LIMIT 8`
        ).all({ post_id: post.id }) as { id: number }[]

        const updateComment = db.prepare(`UPDATE comments SET total_boost = ? WHERE id = ?`)
        for (let j = 0; j < comments.length; j++) {
            const cUsd = USD_LEVELS[j % USD_LEVELS.length]
            updateComment.run(toMicro(cUsd), comments[j].id)
        }

        if (comments.length > 0) {
            console.log(`    ↳ ${comments.length} comments: $${USD_LEVELS.slice(0, comments.length).join(', $')}`)
        }
    }

    db.close()
    console.log('\n✨ Boost seed done! Refresh the browser to see gradient tiers.')
}

main()
