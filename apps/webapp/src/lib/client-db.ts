/**
 * Client-side IndexedDB cache via `idb` library.
 * Stores:
 *   - `users` table: caching user_evt_seq + interaction_evt_seq
 *   - `interactions` table: caching user interaction bits_flag per item
 */

import { openDB, type IDBPDatabase } from 'idb'
import { AggType } from '@repo/dukernews-apidefs'

// ─── DB Schema ──────────────────────────────────────────

interface DukerClientDB {
    users: {
        key: string  // address (PK)
        value: {
            address: string
            username: string
            karma: number
            about: string
            email: string
            user_evt_seq: number
            interaction_evt_seq: number
            created_at: number
            updated_at: number
        }
    }
    interactions: {
        key: string  // "2:123" (AggType.POST) or "3:456" (AggType.COMMENT)
        value: {
            key: string
            agg_type: number  // AggType integer: 2=post, 3=comment
            agg_id: number
            bits_flag: number
        }
        indexes: { by_type: number }
    }
}

// ─── DB Instance ────────────────────────────────────────

let dbPromise: Promise<IDBPDatabase<DukerClientDB>> | null = null

function getDb(): Promise<IDBPDatabase<DukerClientDB>> {
    if (!dbPromise) {
        // Bump version to 3 to trigger upgrade for renamed fields
        dbPromise = openDB<DukerClientDB>('duker', 3, {
            upgrade(db, oldVersion) {
                if (oldVersion < 1) {
                    db.createObjectStore('users', { keyPath: 'address' })
                }
                if (oldVersion < 2) {
                    const store = db.createObjectStore('interactions', { keyPath: 'key' })
                    store.createIndex('by_type', 'agg_type')
                } else if (oldVersion < 3) {
                    // Re-create interactions store with renamed fields
                    db.deleteObjectStore('interactions')
                    const store = db.createObjectStore('interactions', { keyPath: 'key' })
                    store.createIndex('by_type', 'agg_type')
                }
            },
        })
    }
    return dbPromise
}

// ─── User Operations ────────────────────────────────────

export type ClientUser = DukerClientDB['users']['value']

export async function getUser(address: string): Promise<ClientUser | undefined> {
    const db = await getDb()
    return db.get('users', address)
}

export async function putUser(user: ClientUser): Promise<void> {
    const db = await getDb()
    await db.put('users', user)
}

export async function getUserEvtSeq(address: string): Promise<number> {
    const user = await getUser(address)
    return user?.user_evt_seq ?? 0
}

export async function setUserEvtSeq(address: string, seq: number): Promise<void> {
    const db = await getDb()
    const existing = await db.get('users', address)
    if (existing) {
        existing.user_evt_seq = seq
        existing.updated_at = Date.now()
        await db.put('users', existing)
    } else {
        await db.put('users', {
            address,
            username: '',
            karma: 1,
            about: '',
            email: '',
            user_evt_seq: seq,
            interaction_evt_seq: 0,
            created_at: Date.now(),
            updated_at: Date.now(),
        })
    }
}

// ─── Interaction Seq ────────────────────────────────────

export async function getInteractionSeq(address: string): Promise<number> {
    const user = await getUser(address)
    return user?.interaction_evt_seq ?? 0
}

export async function setInteractionSeq(address: string, seq: number): Promise<void> {
    const db = await getDb()
    const existing = await db.get('users', address)
    if (existing) {
        existing.interaction_evt_seq = seq
        existing.updated_at = Date.now()
        await db.put('users', existing)
    } else {
        await db.put('users', {
            address,
            username: '',
            karma: 1,
            about: '',
            email: '',
            user_evt_seq: 0,
            interaction_evt_seq: seq,
            created_at: Date.now(),
            updated_at: Date.now(),
        })
    }
}

// ─── Interaction Data ───────────────────────────────────

function makeKey(aggType: AggType, aggId: number): string {
    return `${aggType}:${aggId}`
}

/** Get bits_flag for one item. Returns 0 if not in IDB. */
export async function getLocalInteraction(aggType: AggType, aggId: number): Promise<number> {
    const db = await getDb()
    const row = await db.get('interactions', makeKey(aggType, aggId))
    return row?.bits_flag ?? 0
}

/** Get all interactions from IDB. Returns a Map of "type:id" → bits_flag. */
export async function getAllLocalInteractions(): Promise<Map<string, number>> {
    const db = await getDb()
    const all = await db.getAll('interactions')
    const map = new Map<string, number>()
    for (const row of all) {
        map.set(row.key, row.bits_flag)
    }
    return map
}

/** Set bits_flag for one item in IDB (optimistic update). */
export async function setLocalInteraction(
    aggType: AggType,
    aggId: number,
    bitsFlag: number,
): Promise<void> {
    const db = await getDb()
    const key = makeKey(aggType, aggId)
    if (bitsFlag === 0) {
        await db.delete('interactions', key)
    } else {
        await db.put('interactions', { key, agg_type: aggType, agg_id: aggId, bits_flag: bitsFlag })
    }
}

/** Bulk replace all interactions in IDB (full sync from server). */
export async function putInteractions(
    items: Array<{ agg_type: number; agg_id: number; bits_flag: number }>,
): Promise<void> {
    const db = await getDb()
    const tx = db.transaction('interactions', 'readwrite')
    // Clear existing and write fresh
    await tx.store.clear()
    for (const item of items) {
        await tx.store.put({
            key: makeKey(item.agg_type, item.agg_id),
            agg_type: item.agg_type,
            agg_id: item.agg_id,
            bits_flag: item.bits_flag,
        })
    }
    await tx.done
}
