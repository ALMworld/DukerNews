/**
 * seed-42057647.ts — Seed the large HN thread 42057647.json into the local DB.
 * Inserts ALL comments from the thread.
 *
 * Usage: npx tsx scripts/seed-42057647.ts
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const jsonPath = resolve(__dirname, 'data', '42057647.json')

const item = JSON.parse(readFileSync(jsonPath, 'utf-8'))

console.log(`Seeding HN #${item.id} by ${item.author} (all comments)...`)

const resp = await fetch('http://localhost:3000/api/seed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item, maxComments: 999999 }),
})

const result = await resp.json()
console.log('Result:', JSON.stringify(result, null, 2))
