/**
 * Server middleware definitions for Duker News.
 *
 * Uses TanStack Start's `createMiddleware` for composable, type-safe middleware.
 * These run on every server request (SSR, API routes, server functions).
 */
import { createMiddleware } from '@tanstack/react-start'
import { verifyJwt, parseCookies, COOKIE_NAME, type JWTPayload } from '../server/auth-utils'

// ─── Logging Middleware ──────────────────────────────────
// Logs method, URL, duration, and status for every request.

export const loggingMiddleware = createMiddleware().server(
    async ({ next, request }) => {
        const start = performance.now()
        const method = request.method
        const url = new URL(request.url).pathname

        const result = await next()

        const duration = (performance.now() - start).toFixed(1)
        console.log(`[${method}] ${url} — ${duration}ms`)

        return result
    },
)

// ─── Auth Middleware ─────────────────────────────────────
// Reads the JWT cookie, verifies it, and provides `auth` context.
// Does NOT reject unauthenticated requests — just provides null.
// Protected routes should check `context.auth` and respond accordingly.

export const authMiddleware = createMiddleware()
    .middleware([loggingMiddleware])
    .server(async ({ next, request }) => {
        let auth: JWTPayload | null = null

        try {
            const cookieHeader = request.headers.get('cookie') || ''
            const cookies = parseCookies(cookieHeader)
            const token = cookies[COOKIE_NAME]
            if (token) {
                auth = await verifyJwt(token)
            }
        } catch {
            // Cookie parsing or JWT verification failed — treat as unauthenticated
        }

        return next({
            context: { auth },
        })
    })

// ─── Require Login (authenticated, username optional) ────
// For routes where user must be logged in but may not have a username yet.

export const requireLoginMiddleware = createMiddleware()
    .middleware([authMiddleware])
    .server(async ({ next, context }) => {
        if (!context.auth) {
            throw Response.json(
                { success: false, message: 'Not logged in' },
                { status: 401 },
            )
        }

        return next()
    })

// ─── Require Auth (for protected routes) ─────────────────
// Builds on authMiddleware. Rejects requests without valid auth + username.

export const requireAuthMiddleware = createMiddleware()
    .middleware([authMiddleware])
    .server(async ({ next, context }) => {
        if (!context.auth) {
            throw Response.json(
                { success: false, message: 'Not logged in' },
                { status: 401 },
            )
        }

        if (!context.auth.username) {
            throw Response.json(
                { success: false, message: 'No username minted' },
                { status: 403 },
            )
        }

        return next()
    })
