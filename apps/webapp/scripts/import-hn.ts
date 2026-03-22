/**
 * import-hn.ts
 * Import HN posts + comments into the local Duker database.
 *
 * Approach:
 *   1. Fetch full story + comment tree from hn.algolia.com/api/v1/items/{id}
 *   2. Save raw JSON to data/ directory (for caching / debugging)
 *   3. POST the JSON to the dev server's /api/seed endpoint which applies
 *      the data directly via PostService + CommentService (no RPC needed)
 *
 * Usage:
 *   npx tsx scripts/import-hn.ts 42057647 41009732
 *
 * Options (env vars):
 *   DUKER_URL=http://localhost:3000  Target server
 *   MAX_COMMENTS=200                 Max comments per story
 *   SKIP_FETCH=1                     Skip Algolia fetch, use cached data/ JSON
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, '..', 'data')
const BASE_URL = process.env.DUKER_URL || 'http://localhost:3000'
const MAX_COMMENTS = Number(process.env.MAX_COMMENTS || 200)
const SKIP_FETCH = process.env.SKIP_FETCH === '1'

// ─── HN Algolia Types ────────────────────────────────────

interface AlgoliaItem {
    id: number
    author: string | null
    title: string | null
    url: string | null
    text: string | null
    points: number | null
    type: string
    created_at: string
    created_at_i: number
    children: AlgoliaItem[]
}

// ─── Main ────────────────────────────────────────────────

async function main() {
    let ids = process.argv.slice(2).map(Number).filter(n => n > 0)

    // If no IDs given, fetch all 500 top stories from HN
    if (ids.length === 0) {
        console.log('📡 Fetching top stories from HN Firebase API ...')
        const resp = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json')
        if (!resp.ok) {
            console.error(`❌ Firebase API returned ${resp.status}`)
            process.exit(1)
        }
        ids = (await resp.json()) as number[]
        console.log(`📋 Got ${ids.length} top story IDs`)
    }

    // Ensure data/ directory exists
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

    console.log(`🔗 Target: ${BASE_URL}`)
    console.log(`📁 Data dir: ${DATA_DIR}`)
    console.log(`📦 Importing ${ids.length} HN item(s)\n`)

    let success = 0
    let skipped = 0
    let failed = 0

    // Process sequentially to avoid overwhelming the server
    for (let i = 0; i < ids.length; i++) {
        const id = ids[i]
        console.log(`[${i + 1}/${ids.length}] ── HN #${id}`)
        const result = await importStory(id)
        if (result === 'success') success++
        else if (result === 'skipped') skipped++
        else failed++

        // Small delay between requests to be nice to Algolia
        if (i < ids.length - 1) await sleep(300)
    }

    console.log(`\n✨ Done! ${success} imported, ${skipped} skipped, ${failed} failed`)
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function importStory(hnId: number): Promise<'success' | 'skipped' | 'failed'> {
    const jsonPath = resolve(DATA_DIR, `hn-${hnId}.json`)

    // Step 1: Fetch or load from cache
    let data: AlgoliaItem
    if (SKIP_FETCH && existsSync(jsonPath)) {
        data = JSON.parse(readFileSync(jsonPath, 'utf-8'))
    } else {
        const resp = await fetch(`https://hn.algolia.com/api/v1/items/${hnId}`)
        if (!resp.ok) {
            console.error(`  ❌ Algolia returned ${resp.status}`)
            return 'failed'
        }
        data = await resp.json() as AlgoliaItem
        writeFileSync(jsonPath, JSON.stringify(data, null, 2))
    }

    if (data.type !== 'story') {
        console.error(`  ❌ Item ${hnId} is type "${data.type}", expected "story"`)
        return 'failed'
    }

    const totalComments = countComments(data.children)
    console.log(`  📝 "${data.title}" (${data.points ?? 0} pts, ${totalComments} comments)`)

    // Step 2: POST to server's seed endpoint
    const seedResp = await fetch(`${BASE_URL}/api/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: data, maxComments: MAX_COMMENTS }),
    })

    if (!seedResp.ok) {
        const errText = await seedResp.text()
        console.error(`  ❌ Seed returned ${seedResp.status}: ${errText}`)
        return 'failed'
    }

    const result = await seedResp.json() as any
    if (result.skipped) {
        console.log(`  ⏭️  Already imported (post #${result.postId})`)
        return 'skipped'
    } else {
        console.log(`  ✅ Post #${result.postId} with ${result.commentsImported} comments`)
        return 'success'
    }
}

function countComments(children: AlgoliaItem[]): number {
    let count = 0
    for (const child of children) {
        count += 1 + countComments(child.children || [])
    }
    return count
}

main().catch(err => {
    console.error('❌ Fatal error:', err)
    process.exit(1)
})
