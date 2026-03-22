/**
 * Client-side IndexedDB cache via `idb` library.
 * Stores:
 *   - `users` table: caching user_evt_seq + interaction_evt_seq
 *   - `interactions` table: caching user interaction bits_flag per item
 */

import { openDB, type IDBPDatabase } from 'idb'

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
        key: string  // "post:123" or "comment:456"
        value: {
            key: string
            item_type: string
            item_id: number
            bits_flag: number
        }
        indexes: { by_type: string }
    }
}

// ─── DB Instance ────────────────────────────────────────

let dbPromise: Promise<IDBPDatabase<DukerClientDB>> | null = null

function getDb(): Promise<IDBPDatabase<DukerClientDB>> {
    if (!dbPromise) {
        dbPromise = openDB<DukerClientDB>('duker', 2, {
            upgrade(db, oldVersion) {
                if (oldVersion < 1) {
                    db.createObjectStore('users', { keyPath: 'address' })
                }
                if (oldVersion < 2) {
                    const store = db.createObjectStore('interactions', { keyPath: 'key' })
                    store.createIndex('by_type', 'item_type')
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

function makeKey(itemType: string, itemId: number): string {
    return `${itemType}:${itemId}`
}

/** Get bits_flag for one item. Returns 0 if not in IDB. */
export async function getLocalInteraction(itemType: string, itemId: number): Promise<number> {
    const db = await getDb()
    const row = await db.get('interactions', makeKey(itemType, itemId))
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
    itemType: string,
    itemId: number,
    bitsFlag: number,
): Promise<void> {
    const db = await getDb()
    const key = makeKey(itemType, itemId)
    if (bitsFlag === 0) {
        await db.delete('interactions', key)
    } else {
        await db.put('interactions', { key, item_type: itemType, item_id: itemId, bits_flag: bitsFlag })
    }
}

/** Bulk replace all interactions in IDB (full sync from server). */
export async function putInteractions(
    items: Array<{ item_type: string; item_id: number; bits_flag: number }>,
): Promise<void> {
    const db = await getDb()
    const tx = db.transaction('interactions', 'readwrite')
    // Clear existing and write fresh
    await tx.store.clear()
    for (const item of items) {
        await tx.store.put({
            key: makeKey(item.item_type, item.item_id),
            item_type: item.item_type,
            item_id: item.item_id,
            bits_flag: item.bits_flag,
        })
    }
    await tx.done
}

