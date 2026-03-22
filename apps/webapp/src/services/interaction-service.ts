/**
 * Interaction Service — bitmask-based user interactions
 *
 * Bits layout within `bits_flag`:
 *   bits 0-1: vote (00=none, 01=up, 10=down)
 *   bit  2:   flag
 *   bit  3:   hide
 *   bit  4:   favorite
 *   bit  5:   vouch
 */

import { sql } from 'kysely'
import { getKysely } from '../lib/db'

// Bit constants from shared module (client-safe)
import {
    VOTE_MASK, VOTE_UP, VOTE_DOWN, VOTE_NONE,
    BIT_FLAG, BIT_HIDE, BIT_FAVORITE, BIT_VOUCH,
} from '../lib/interaction-bits'
export {
    VOTE_MASK, VOTE_UP, VOTE_DOWN, VOTE_NONE,
    BIT_FLAG, BIT_HIDE, BIT_FAVORITE, BIT_VOUCH,
}

// ── Core operations ─────────────────────────────────────────────────────────

/**
 * Set vote state (clears previous vote, sets new one).
 * Pass VOTE_NONE to clear the vote without affecting other bits.
 */
export async function setVote(
    username: string,
    itemType: string,
    itemId: bigint,
    vote: typeof VOTE_UP | typeof VOTE_DOWN | typeof VOTE_NONE,
): Promise<void> {
    const db = getKysely()
    if (!db) throw new Error('Database not available')
    const now = Date.now()
    const inverseMask = ~VOTE_MASK  // pre-compute: -4 in two's complement

    // Use Kysely's insertInto + onConflict for better D1 compatibility
    await db
        .insertInto('user_interactions')
        .values({
            username,
            item_type: itemType,
            item_id: itemId,
            bits_flag: vote,
            created_at: now,
            updated_at: now,
        })
        .onConflict((oc) =>
            oc.columns(['username', 'item_type', 'item_id']).doUpdateSet({
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
    itemType: string,
    itemId: bigint,
    bits: number,
): Promise<void> {
    const db = getKysely()
    if (!db) throw new Error('Database not available')
    const now = Date.now()

    await db
        .insertInto('user_interactions')
        .values({
            username,
            item_type: itemType,
            item_id: itemId,
            bits_flag: bits,
            created_at: now,
            updated_at: now,
        })
        .onConflict((oc) =>
            oc.columns(['username', 'item_type', 'item_id']).doUpdateSet({
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
    itemType: string,
    itemId: bigint,
    bits: number,
): Promise<void> {
    const db = getKysely()
    if (!db) throw new Error('Database not available')
    const now = Date.now()
    const inverseBits = ~bits

    await db
        .updateTable('user_interactions')
        .set({
            bits_flag: sql`bits_flag & ${inverseBits}`,
            updated_at: now,
        })
        .where('username', '=', username)
        .where('item_type', '=', itemType)
        .where('item_id', '=', itemId)
        .execute()
}

/**
 * Get the full bits_flag for a user-item pair. Returns 0 if no row.
 */
export async function getInteraction(
    username: string,
    itemType: string,
    itemId: bigint,
): Promise<number> {
    const db = getKysely()
    if (!db) return 0

    const row = await sql<{ bits_flag: number }>`
        SELECT bits_flag FROM user_interactions
        WHERE username = ${username} AND item_type = ${itemType} AND item_id = ${itemId}
    `.execute(db)

    return row.rows[0]?.bits_flag ?? 0
}

/**
 * Check if specific bit(s) are set.
 */
export async function hasInteraction(
    username: string,
    itemType: string,
    itemId: bigint,
    bits: number,
): Promise<boolean> {
    const state = await getInteraction(username, itemType, itemId)
    return (state & bits) !== 0
}

/**
 * Get vote state for a user-item pair.
 */
export async function getVote(
    username: string,
    itemType: string,
    itemId: bigint,
): Promise<typeof VOTE_UP | typeof VOTE_DOWN | typeof VOTE_NONE> {
    const state = await getInteraction(username, itemType, itemId)
    return (state & VOTE_MASK) as typeof VOTE_UP | typeof VOTE_DOWN | typeof VOTE_NONE
}

/**
 * Get all items where a specific bit is set for a user.
 * Useful for favorites page, hidden items list, etc.
 */
export async function getUserItemsByBit(
    username: string,
    bit: number,
    itemType?: string,
): Promise<Array<{ item_type: string; item_id: number }>> {
    const db = getKysely()
    if (!db) return []

    if (itemType) {
        const rows = await sql<{ item_type: string; item_id: number }>`
            SELECT item_type, item_id FROM user_interactions
            WHERE username = ${username} AND item_type = ${itemType} AND (bits_flag & ${bit}) != 0
            ORDER BY updated_at DESC
        `.execute(db)
        return rows.rows
    }

    const rows = await sql<{ item_type: string; item_id: number }>`
        SELECT item_type, item_id FROM user_interactions
        WHERE username = ${username} AND (bits_flag & ${bit}) != 0
        ORDER BY updated_at DESC
    `.execute(db)
    return rows.rows
}

/**
 * Get ALL interaction rows for a user.
 * Returns { item_type, item_id, bits_flag } for each row where bits_flag > 0.
 */
export async function getAllInteractions(
    username: string,
): Promise<Array<{ item_type: string; item_id: number; bits_flag: number }>> {
    const db = getKysely()
    if (!db) return []

    const result = await db
        .selectFrom('user_interactions')
        .select(['item_type', 'item_id', 'bits_flag'])
        .where('username', '=', username)
        .where('bits_flag', '>', 0)
        .execute()

    return result
}
