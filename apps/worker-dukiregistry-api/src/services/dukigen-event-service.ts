/**
 * dukigen-event-service.ts — Persist DukigenRegistry events and materialize agents.
 */

import type { PulledDukigenEvent } from './chain-puller'
import { DukigenEventType } from '@repo/dukiregistry-apidefs'

/**
 * Persist a raw DukigenEvent to the dukigen_registry_events table.
 */
export async function persistDukigenEvent(db: D1Database, evt: PulledDukigenEvent): Promise<void> {
    await db.prepare(`
        INSERT OR IGNORE INTO dukigen_registry_events
        (chain_eid, evt_seq, agent_id, event_type, ego, evt_time, tx_hash, block_number, event_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        evt.chainEid,
        Number(evt.evtSeq),
        evt.agentId.toString(),
        evt.eventType,
        evt.ego,
        Number(evt.evtTime),
        evt.txHash,
        Number(evt.blockNumber),
        evt.eventData,
    ).run()
}

/**
 * Materialize agent state from a DukigenEvent.
 */
export async function materializeAgent(db: D1Database, evt: PulledDukigenEvent): Promise<void> {
    const now = Math.floor(Date.now() / 1000)

    switch (evt.eventType) {
        case DukigenEventType.AGENT_REGISTERED: {
            await db.prepare(`
                INSERT OR REPLACE INTO dukigen_agents
                (agent_id, owner, origin_chain_eid, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
            `).bind(
                evt.agentId.toString(),
                evt.ego,
                evt.chainEid,
                Number(evt.evtTime),
                now,
            ).run()
            break
        }

        case DukigenEventType.AGENT_URI_UPDATED: {
            await db.prepare(`
                UPDATE dukigen_agents SET agent_uri = '', updated_at = ?
                WHERE agent_id = ?
            `).bind(now, evt.agentId.toString()).run()
            // TODO: decode ABI to get newURI
            break
        }

        case DukigenEventType.AGENT_DUKI_BPS_SET: {
            // TODO: decode ABI to get defaultDukiBps, minDukiBps, maxDukiBps
            await db.prepare(`
                UPDATE dukigen_agents SET updated_at = ?
                WHERE agent_id = ?
            `).bind(now, evt.agentId.toString()).run()
            break
        }

        case DukigenEventType.AGENT_WALLET_SET: {
            // TODO: decode ABI to get newWallet
            await db.prepare(`
                UPDATE dukigen_agents SET updated_at = ?
                WHERE agent_id = ?
            `).bind(now, evt.agentId.toString()).run()
            break
        }

        default:
            // WORKS_DATA_SET, METADATA_SET, WALLET_UNSET, PAYMENT_PROCESSED — log only for now
            break
    }
}

/**
 * Process all DukigenEvents from a tx: persist + materialize.
 */
export async function processDukigenEvents(db: D1Database, events: PulledDukigenEvent[]): Promise<void> {
    for (const evt of events) {
        await persistDukigenEvent(db, evt)
        await materializeAgent(db, evt)
    }
}
