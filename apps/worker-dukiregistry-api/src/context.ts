/**
 * context.ts — Hono app types for duker-registry-worker.
 */

export interface Env {
    DB: D1Database
    ENVIRONMENT: string
    NAME: string
    ALLOWED_ORIGINS: string
}

export type App = { Bindings: Env }
