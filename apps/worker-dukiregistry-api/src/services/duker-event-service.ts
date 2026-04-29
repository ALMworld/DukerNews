/**
 * duker-event-service.ts — Persist DukerRegistry events and materialize identities.
 */

import type { DukerRegistryEvent } from '@repo/dukiregistry-apidefs'
import { DukerEventType, DukerEventDataSchema } from '@repo/dukiregistry-apidefs'
import { toBinary } from '@bufbuild/protobuf'

/**
 * Persist a raw DukerEvent to the duker_registry_events table.
 * Stores the proto-serialized DukerEventData as a BLOB in event_data.
 */
export async function persistDukerEvent(db: D1Database, evt: DukerRegistryEvent): Promise<void> {
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
        evt.eventData ? toBinary(DukerEventDataSchema, evt.eventData) : null,
    ).run()
}

/**
 * Materialize identity state from a DukerEvent.
 * Updates duker_users / duker_preferences based on event type.
 */
export async function materializeIdentity(db: D1Database, evt: DukerRegistryEvent): Promise<void> {
    const now = Math.floor(Date.now() / 1000)

    switch (evt.eventType) {
        case DukerEventType.USER_MINTED: {
            // Extract displayName from username: "alice.30184" → "alice"
            const dotIdx = evt.username.lastIndexOf('.')
            const displayName = dotIdx > 0 ? evt.username.substring(0, dotIdx) : evt.username

            await db.prepare(`
                INSERT OR REPLACE INTO duker_users
                (token_id, username, chain_eid, ego, display_name, active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?)
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
                UPDATE duker_users SET active = 0, updated_at = ?
                WHERE token_id = ?
            `).bind(now, evt.tokenId.toString()).run()
            break
        }

        case DukerEventType.PROFILE_UPDATED: {
            if (evt.eventData?.payload.case !== 'profileUpdated') break
            const bio = evt.eventData.payload.value.bio ?? ''
            const website = evt.eventData.payload.value.website ?? ''

            await db.prepare(`
                UPDATE duker_users SET bio = ?, website = ?, updated_at = ?
                WHERE token_id = ?
            `).bind(bio, website, now, evt.tokenId.toString()).run()
            break
        }

        default:
            break
    }
}

/**
 * Process all DukerEvents from a tx: persist + materialize.
 */
export async function processDukerEvents(db: D1Database, events: DukerRegistryEvent[]): Promise<void> {
    for (const evt of events) {
        await persistDukerEvent(db, evt)
        await materializeIdentity(db, evt)
    }
}
