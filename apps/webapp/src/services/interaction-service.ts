/**
 * Interaction Service — bitmask-based user interactions
 *
 * Bits layout within `bits_flag`:
 *   bits 0-1: vote (00=none, 01=up, 10=down)
 *   bit  2:   flag
 *   bit  3:   hide
 *   bit  4:   favorite
 *   bit  5:   vouch
 *   bit  6:   boost (user has boosted this item)
 */

import { sql } from 'kysely'
import { getKysely } from '../lib/db'
import { AggType } from '@repo/dukernews-apidefs'

// Bit constants from shared module (client-safe)
import {
    VOTE_MASK, VOTE_UP, VOTE_DOWN, VOTE_NONE,
    BIT_FLAG, BIT_HIDE, BIT_FAVORITE, BIT_VOUCH, BIT_BOOST,
} from '../lib/interaction-bits'
export {
    VOTE_MASK, VOTE_UP, VOTE_DOWN, VOTE_NONE,
    BIT_FLAG, BIT_HIDE, BIT_FAVORITE, BIT_VOUCH, BIT_BOOST,
    AggType,
}

// ── Core operations ─────────────────────────────────────────────────────────

/**
 * Set vote state (clears previous vote, sets new one).
 * Pass VOTE_NONE to clear the vote without affecting other bits.
 */
export async function setVote(
    username: string,
    aggType: AggType,
    aggId: bigint,
    vote: typeof VOTE_UP | typeof VOTE_DOWN | typeof VOTE_NONE,
): Promise<void> {
    const db = getKysely()
    if (!db) throw new Error('Database not available')
    const now = Date.now()
    const inverseMask = ~VOTE_MASK  // pre-compute: -4 in two's complement
    const aggIdNum = Number(aggId)  // D1 doesn't support bigint

    // Use Kysely's insertInto + onConflict for better D1 compatibility
    await db
        .insertInto('user_interactions')
        .values({
            username,
            agg_type: aggType,
            agg_id: aggIdNum as any,
            bits_flag: vote,
            created_at: now,
            updated_at: now,
        })
        .onConflict((oc) =>
            oc.columns(['username', 'agg_type', 'agg_id']).doUpdateSet({
                bits_flag: sql`(bits_flag & ${inverseMask}) | ${vote}`,
                updated_at: now,
            })
        )
        .execute()
}

/**
 * Set one or more independent flag bits (OR them in).
 */
export async function setBits(
    username: string,
    aggType: AggType,
    aggId: bigint,
    bits: number,
): Promise<void> {
    const db = getKysely()
    if (!db) throw new Error('Database not available')
    const now = Date.now()
    const aggIdNum = Number(aggId)  // D1 doesn't support bigint

    await db
        .insertInto('user_interactions')
        .values({
            username,
            agg_type: aggType,
            agg_id: aggIdNum as any,
            bits_flag: bits,
            created_at: now,
            updated_at: now,
        })
        .onConflict((oc) =>
            oc.columns(['username', 'agg_type', 'agg_id']).doUpdateSet({
                bits_flag: sql`bits_flag | ${bits}`,
                updated_at: now,
            })
        )
        .execute()
}

/**
 * Clear one or more independent flag bits (AND with inverse).
 */
export async function clearBits(
    username: string,
    aggType: AggType,
    aggId: bigint,
    bits: number,
): Promise<void> {
    const db = getKysely()
    if (!db) throw new Error('Database not available')
    const now = Date.now()
    const inverseBits = ~bits
    const aggIdNum = Number(aggId)  // D1 doesn't support bigint

    await db
        .updateTable('user_interactions')
        .set({
            bits_flag: sql`bits_flag & ${inverseBits}`,
            updated_at: now,
        })
        .where('username', '=', username)
        .where('agg_type', '=', aggType)
        .where('agg_id', '=', aggIdNum as any)
        .execute()
}

/**
 * Get the full bits_flag for a user-item pair. Returns 0 if no row.
 */
export async function getInteraction(
    username: string,
    aggType: AggType,
    aggId: bigint,
): Promise<number> {
    const db = getKysely()
    if (!db) return 0
    const aggIdNum = Number(aggId)  // D1 doesn't support bigint

    const row = await sql<{ bits_flag: number }>`
        SELECT bits_flag FROM user_interactions
        WHERE username = ${username} AND agg_type = ${aggType} AND agg_id = ${aggIdNum}
    `.execute(db)

    return row.rows[0]?.bits_flag ?? 0
}

/**
 * Check if specific bit(s) are set.
 */
export async function hasInteraction(
    username: string,
    aggType: AggType,
    aggId: bigint,
    bits: number,
): Promise<boolean> {
    const state = await getInteraction(username, aggType, aggId)
    return (state & bits) !== 0
}

/**
 * Get vote state for a user-item pair.
 */
export async function getVote(
    username: string,
    aggType: AggType,
    aggId: bigint,
): Promise<typeof VOTE_UP | typeof VOTE_DOWN | typeof VOTE_NONE> {
    const state = await getInteraction(username, aggType, aggId)
    return (state & VOTE_MASK) as typeof VOTE_UP | typeof VOTE_DOWN | typeof VOTE_NONE
}

/**
 * Get all items where a specific bit is set for a user.
 * Useful for favorites page, hidden items list, etc.
 */
export async function getUserItemsByBit(
    username: string,
    bit: number,
    aggType?: AggType,
): Promise<Array<{ agg_type: number; agg_id: number }>> {
    const db = getKysely()
    if (!db) return []

    if (aggType) {
        const rows = await sql<{ agg_type: number; agg_id: number }>`
            SELECT agg_type, agg_id FROM user_interactions
            WHERE username = ${username} AND agg_type = ${aggType} AND (bits_flag & ${bit}) != 0
            ORDER BY updated_at DESC
        `.execute(db)
        return rows.rows
    }

    const rows = await sql<{ agg_type: number; agg_id: number }>`
        SELECT agg_type, agg_id FROM user_interactions
        WHERE username = ${username} AND (bits_flag & ${bit}) != 0
        ORDER BY updated_at DESC
    `.execute(db)
    return rows.rows
}

/**
 * Get ALL interaction rows for a user.
 * Returns { agg_type, agg_id, bits_flag } for each row where bits_flag > 0.
 */
export async function getAllInteractions(
    username: string,
): Promise<Array<{ agg_type: number; agg_id: number; bits_flag: number }>> {
    const db = getKysely()
    if (!db) return []

    const result = await db
        .selectFrom('user_interactions')
        .select(['agg_type', 'agg_id', 'bits_flag'])
        .where('username', '=', username)
        .where('bits_flag', '>', 0)
        .execute()

    // D1/SQLite returns agg_id as number, not bigint — cast explicitly
    return result as unknown as Array<{ agg_type: number; agg_id: number; bits_flag: number }>
}
