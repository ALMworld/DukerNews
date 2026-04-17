/**
 * duker-event-service.ts — Persist DukerRegistry events and materialize identities.
 */

import type { PulledDukerEvent } from './chain-puller'
import { DukerEventType } from '@repo/dukiregistry-apidefs'

/**
 * Persist a raw DukerEvent to the duker_registry_events table.
 */
export async function persistDukerEvent(db: D1Database, evt: PulledDukerEvent): Promise<void> {
    await db.prepare(`
        INSERT OR IGNORE INTO duker_registry_events
        (chain_eid, evt_seq, token_id, event_type, ego, username, evt_time, tx_hash, block_number, event_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        evt.chainEid,
        Number(evt.evtSeq),
        evt.tokenId.toString(),
        evt.eventType,
        evt.ego,
        evt.username,
        Number(evt.evtTime),
        evt.txHash,
        Number(evt.blockNumber),
        evt.eventData,
    ).run()
}

/**
 * Materialize identity state from a DukerEvent.
 * Updates duker_users / duker_preferences based on event type.
 */
export async function materializeIdentity(db: D1Database, evt: PulledDukerEvent): Promise<void> {
    const now = Math.floor(Date.now() / 1000)

    switch (evt.eventType) {
        case DukerEventType.USER_MINTED: {
            // Extract displayName from username: "alice.30184" → "alice"
            const dotIdx = evt.username.lastIndexOf('.')
            const displayName = dotIdx > 0 ? evt.username.substring(0, dotIdx) : evt.username

            await db.prepare(`
                INSERT OR REPLACE INTO duker_users
                (chain_eid, token_id, owner, username, display_name, origin_eid, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
            `).bind(
                evt.chainEid,
                evt.tokenId.toString(),
                evt.ego,
                evt.username,
                displayName,
                evt.chainEid, // origin = this chain for mints
                Number(evt.evtTime),
                now,
            ).run()
            break
        }

        case DukerEventType.IDENTITY_REPLICATE_RECEIVED_CLAIMED: {
            // Replica arrived on this chain — insert new user row
            const dotIdx = evt.username.lastIndexOf('.')
            const displayName = dotIdx > 0 ? evt.username.substring(0, dotIdx) : evt.username
            // Extract origin EID from username suffix
            const originEid = dotIdx > 0 ? parseInt(evt.username.substring(dotIdx + 1), 10) : evt.chainEid

            await db.prepare(`
                INSERT OR REPLACE INTO duker_users
                (chain_eid, token_id, owner, username, display_name, origin_eid, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
            `).bind(
                evt.chainEid,
                evt.tokenId.toString(),
                evt.ego,
                evt.username,
                displayName,
                originEid,
                Number(evt.evtTime),
                now,
            ).run()
            break
        }

        case DukerEventType.IDENTITY_BURNED: {
            await db.prepare(`
                UPDATE duker_users SET status = 'burned', updated_at = ?
                WHERE chain_eid = ? AND token_id = ?
            `).bind(now, evt.chainEid, evt.tokenId.toString()).run()
            break
        }

        case DukerEventType.IDENTITY_PREFERENCES_SET: {
            // eventData contains (dukigenAgentId, preferDukiBps) — parse from hex
            // For now, store raw in event log. D1 materialization can be extended.
            // TODO: decode ABI and upsert duker_preferences
            break
        }

        default:
            // REPLICATE_SENT, REPLICATE_RECEIVED_PENDING, REJECTED — log only
            break
    }
}

/**
 * Process all DukerEvents from a tx: persist + materialize.
 */
export async function processDukerEvents(db: D1Database, events: PulledDukerEvent[]): Promise<void> {
    for (const evt of events) {
        await persistDukerEvent(db, evt)
        await materializeIdentity(db, evt)
    }
}
