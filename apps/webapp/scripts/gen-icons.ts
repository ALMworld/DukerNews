/**
 * gen-icons.ts
 * Generates logo192.png, logo512.png, and apple-touch-icon.png
 * from public/favicon.svg.
 *
 * Usage:  npx tsx scripts/gen-icons.ts   (or: pnpm gen:icons)
 * Deps:   pnpm add -D sharp
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const PUBLIC = resolve(ROOT, 'public')
const SVG_PATH = resolve(PUBLIC, 'favicon.svg')

async function main() {
    const svgBuf = readFileSync(SVG_PATH)

    console.log('🎨 Generating icons from public/favicon.svg …')

    const sizes = [
        { name: 'logo192.png', size: 192 },
        { name: 'logo512.png', size: 512 },
        { name: 'apple-touch-icon.png', size: 180 },
    ]

    for (const { name, size } of sizes) {
        const buf = await sharp(svgBuf).resize(size, size).png().toBuffer()
        const outPath = resolve(PUBLIC, name)
        writeFileSync(outPath, buf)
        console.log(`  ✅ ${name}  (${size}×${size}, ${buf.length} bytes)`)
    }

    console.log('\n✨ Done! Icons written to public/')
}

main().catch((err) => {
    console.error('❌ Error generating icons:', err)
    process.exit(1)
})
