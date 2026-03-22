/**
 * Kysely database helper — wraps D1 binding from Cloudflare Worker environment.
 * 
 * Uses `import { env } from "cloudflare:workers"` for global access to bindings.
 * This works in both dev (via @cloudflare/vite-plugin) and production (deployed Workers)
 *
 * Returns null when MIGRATED=true so any remaining sqlite call fails loudly.
 */

import { Kysely } from 'kysely'
import { D1Dialect } from 'kysely-d1'
import type { DB } from '@repo/apidefs'
import { env } from 'cloudflare:workers'
import { MIGRATED } from './grpc-goapi-transport'

interface CloudflareEnv {
    DB: D1Database
}

/**
 * Get a Kysely instance wrapping the D1 database.
 * Returns null when Cloudflare env is not available OR when MIGRATED=true.
 */
export function getKysely(): Kysely<DB> | null {
    if (MIGRATED) return null
    try {
        const cfEnv = env as unknown as CloudflareEnv
        if (cfEnv?.DB) {
            return new Kysely<DB>({ dialect: new D1Dialect({ database: cfEnv.DB }) })
        }
    } catch {
        // Not in a Cloudflare Workers context
    }
    return null
}

