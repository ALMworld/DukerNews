#!/usr/bin/env node
/**
 * Generate Kysely types from 0000_schema.sql
 * 
 * Source of truth: apps/webapp/migrations/0000_schema.sql
 * 
 * This script:
 * 1. Reads the SQL schema file
 * 2. Creates a temp SQLite database from the SQL statements
 * 3. Runs kysely-codegen to generate types.generated.ts
 * 4. Post-processes the output (Buffer→Uint8Array, bigint null cleanup)
 * 
 * Usage: pnpm run db:codegen
 */

import Database from 'better-sqlite3'
import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..') // packages/apidefs
const MONOREPO_ROOT = join(ROOT, '..', '..')
const SRC_DB = join(ROOT, 'src', 'db')

// Paths
const SCHEMA_SQL_PATH = join(MONOREPO_ROOT, 'apps', 'webapp', 'migrations', '0000_schema.sql')
const TYPES_OUTPUT_PATH = join(SRC_DB, 'types.generated.ts')
const TEMP_DB_PATH = join(ROOT, '.temp-schema.db')

async function main() {
    console.log('🔧 Generating Kysely types from 0000_schema.sql...\n')

    // 1. Read the SQL schema file
    console.log('📖 Reading schema from 0000_schema.sql...')
    if (!existsSync(SCHEMA_SQL_PATH)) {
        console.error(`   ✗ Schema file not found: ${SCHEMA_SQL_PATH}`)
        process.exit(1)
    }
    const schemaSql = readFileSync(SCHEMA_SQL_PATH, 'utf-8')
    // Split by semicolons, strip comment-only lines from each statement, filter empties
    const statements = schemaSql
        .split(';')
        .map(s => s
            .split('\n')
            .filter(line => !line.trim().startsWith('--'))
            .join('\n')
            .trim()
        )
        .filter(s => s.length > 0)
    console.log(`   ✓ Found ${statements.length} statements\n`)

    // 2. Create temp SQLite database and apply schema
    console.log('🗄️  Creating temp SQLite database...')
    if (existsSync(TEMP_DB_PATH)) {
        unlinkSync(TEMP_DB_PATH)
    }

    const db = new Database(TEMP_DB_PATH)
    for (const statement of statements) {
        db.exec(statement)
    }
    db.close()
    console.log('   ✓ Schema applied\n')

    // 3. Run kysely-codegen
    console.log('⚙️  Running kysely-codegen...')
    try {
        execSync(
            `npx kysely-codegen --dialect sqlite --url "${TEMP_DB_PATH}" --out-file "${TYPES_OUTPUT_PATH}" --config-file "scripts/kysely-codegen.config.ts"`,
            { stdio: 'inherit', cwd: ROOT }
        )
        console.log('   ✓ Types generated\n')
    } catch (error) {
        console.error('   ✗ kysely-codegen failed:', error)
        process.exit(1)
    }

    // 4. Cleanup temp file
    unlinkSync(TEMP_DB_PATH)

    // 5. Post-process types: add header, replace Buffer, clean up redundant nulls
    let generatedTypes = readFileSync(TYPES_OUTPUT_PATH, 'utf-8')
    generatedTypes = generatedTypes.replace(/Buffer/g, 'Uint8Array')
    // Clean up redundant '| null' from bigint overrides (kysely-codegen appends | null for nullable cols)
    generatedTypes = generatedTypes.replace(/bigint \| null \| null/g, 'bigint | null')
    generatedTypes = generatedTypes.replace(/Generated<bigint> \| null/g, 'Generated<bigint | null>')

    const header = `// ⚠️ AUTO-GENERATED — do not edit manually
// Run: pnpm run db:codegen
// Source of truth: apps/webapp/migrations/0000_schema.sql

`
    writeFileSync(TYPES_OUTPUT_PATH, header + generatedTypes)

    console.log('✅ Done!')
    console.log(`   Source: apps/webapp/migrations/0000_schema.sql`)
    console.log(`   Output: ${TYPES_OUTPUT_PATH}`)
}

main().catch(console.error)
