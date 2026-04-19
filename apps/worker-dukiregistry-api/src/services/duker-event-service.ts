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
                (token_id, username, chain_eid, ego, display_name, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
            `).bind(
                evt.tokenId.toString(),
                evt.username,
                evt.chainEid,
                evt.ego,
                displayName,
                Number(evt.evtTime),
                now,
            ).run()
            break
        }

        case DukerEventType.IDENTITY_BURNED: {
            await db.prepare(`
                UPDATE duker_users SET status = 'burned', updated_at = ?
                WHERE token_id = ?
            `).bind(now, evt.tokenId.toString()).run()
            break
        }

        case DukerEventType.IDENTITY_PREFERENCES_SET: {
            // eventData contains (dukigenAgentId, preferDukiBps) — parse from hex
            // For now, store raw in event log. D1 materialization can be extended.
            // TODO: decode ABI and upsert duker_preferences
            break
        }

        case DukerEventType.PROFILE_UPDATED: {
            // eventData contains (bio, website) — ABI-encoded
            // TODO: decode ABI and update bio/website columns
            await db.prepare(`
                UPDATE duker_users SET updated_at = ?
                WHERE token_id = ?
            `).bind(now, evt.tokenId.toString()).run()
            break
        }

        default:
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
