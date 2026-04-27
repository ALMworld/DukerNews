/**
 * dukigen-event-service.ts — Persist DukigenRegistry events and materialize agents.
 */

import type { PulledDukigenEvent } from './chain-puller'
import { DukigenEventType } from '@repo/dukiregistry-apidefs'
import { dukigenRegistryAbi } from 'contract-duki-alm-world'
import { decodeEventPayload } from './event-payload'

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
 * Decodes ABI-encoded eventData for each event type.
 */
export async function materializeAgent(db: D1Database, evt: PulledDukigenEvent): Promise<void> {
    const now = Math.floor(Date.now() / 1000)

    switch (evt.eventType) {
        case DukigenEventType.AGENT_REGISTERED: {
            const d = decodeEventPayload<{ name: string; agentURI: string }>(
                dukigenRegistryAbi, 'AgentRegisteredData', evt.eventData,
            )
            const name = d?.name ?? ''
            const agentUri = d?.agentURI ?? ''

            await db.prepare(`
                INSERT OR REPLACE INTO dukigen_agents
                (agent_id, name, agent_uri, owner, origin_chain_eid, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(
                evt.agentId.toString(),
                name,
                agentUri,
                evt.ego,
                evt.chainEid,
                Number(evt.evtTime),
                now,
            ).run()
            break
        }

        case DukigenEventType.AGENT_URI_UPDATED: {
            const d = decodeEventPayload<{ newURI: string }>(
                dukigenRegistryAbi, 'AgentURIUpdatedData', evt.eventData,
            )
            const newUri = d?.newURI ?? ''

            await db.prepare(`
                UPDATE dukigen_agents SET agent_uri = ?, updated_at = ?
                WHERE agent_id = ?
            `).bind(newUri, now, evt.agentId.toString()).run()
            break
        }

        case DukigenEventType.AGENT_APPROX_BPS_SET: {
            const d = decodeEventPayload<{ approxBps: number | bigint }>(
                dukigenRegistryAbi, 'AgentApproxBpsSetData', evt.eventData,
            )
            const approxBps = Number(d?.approxBps ?? 0)

            await db.prepare(`
                UPDATE dukigen_agents SET approx_bps = ?, updated_at = ?
                WHERE agent_id = ?
            `).bind(approxBps, now, evt.agentId.toString()).run()
            break
        }

        case DukigenEventType.AGENT_WORKS_DATA_SET: {
            const d = decodeEventPayload<{
                productType: number | bigint; dukiType: number | bigint;
                pledgeUrl: string; tags: string[];
            }>(dukigenRegistryAbi, 'AgentWorksDataSetData', evt.eventData)
            const productType = Number(d?.productType ?? 0)
            const dukiType = Number(d?.dukiType ?? 0)
            const pledgeUrl = d?.pledgeUrl ?? ''
            const tags = d?.tags ?? []

            await db.prepare(`
                UPDATE dukigen_agents SET product_type = ?, duki_type = ?, pledge_url = ?, tags = ?, updated_at = ?
                WHERE agent_id = ?
            `).bind(productType, dukiType, pledgeUrl, JSON.stringify(tags), now, evt.agentId.toString()).run()
            break
        }

        case DukigenEventType.AGENT_WALLET_SET: {
            // eventData = abi.encode(AgentWalletSetData) = (address newWallet)
            await db.prepare(`
                UPDATE dukigen_agents SET updated_at = ?
                WHERE agent_id = ?
            `).bind(now, evt.agentId.toString()).run()
            break
        }

        default:
            // METADATA_SET, CHAIN_CONTRACT_SET — log only for now
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

