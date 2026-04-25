/**
 * UserService — type-safe Kysely queries, proto types from @repo/apidefs.
 * Consumed by both createServerFn and Server Routes.
 */

import { getKysely } from '../lib/db'
import type { PbUser } from '@repo/dukernews-apidefs'

// ─── Input Types ─────────────────────────────────────────

export interface UpdateUserInput {
    address: string
    username?: string
    about?: string
    email?: string
}

/** User profile with computed counts (extends proto User) */
export interface UserProfile extends Omit<PbUser, '$typeName' | '$unknown'> {
    submissions: number
    comments: number
}

// ─── Service Functions ───────────────────────────────────

export async function getUser(identifier: string): Promise<UserProfile | null> {
    const db = getKysely()
    if (!db) return null

    // Try by address first, then by username
    let row = await db
        .selectFrom('users')
        .selectAll()
        .where('address', '=', identifier)
        .executeTakeFirst()

    if (!row) {
        row = await db
            .selectFrom('users')
            .selectAll()
            .where('username', '=', identifier)
            .executeTakeFirst()
    }

    if (!row) return null

    const submissionCount = await db
        .selectFrom('posts')
        .select(db.fn.countAll<number>().as('count'))
        .where('username', '=', row.username)
        .executeTakeFirst()

    const commentCount = await db
        .selectFrom('comments')
        .select(db.fn.countAll<number>().as('count'))
        .where('username', '=', row.username)
        .executeTakeFirst()

    return {
        address: row.address,
        username: row.username,
        karma: row.karma ?? 1,
        about: row.about ?? '',
        email: row.email ?? '',
        latestEvtSeq: Number(row.latest_evt_seq ?? 0) as any,
        createdAt: Number(row.created_at) as any,
        updatedAt: Number(row.updated_at) as any,
        submissions: submissionCount?.count ?? 0,
        comments: commentCount?.count ?? 0,
    }
}

export async function updateUser(input: UpdateUserInput): Promise<UserProfile | null> {
    const db = getKysely()
    if (!db) throw new Error('Database not available — cannot update user without D1')

    const now = Date.now()
    const updates: Record<string, any> = { updated_at: now }

    if (input.about !== undefined) {
        updates.about = input.about
    }
    if (input.email !== undefined) {
        updates.email = input.email
    }
    if (input.username !== undefined && input.username.trim().length >= 2) {
        updates.username = input.username.trim()
    }

    await db
        .updateTable('users')
        .set(updates)
        .where('address', '=', input.address)
        .execute()

    return await getUser(input.address)
}
