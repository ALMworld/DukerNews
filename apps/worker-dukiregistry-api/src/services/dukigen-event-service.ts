/**
 * dukigen-event-service.ts — Persist DukigenRegistry events and materialize agents.
 */

import { decodeAbiParameters } from 'viem'
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
 * Decodes ABI-encoded eventData for each event type.
 */
export async function materializeAgent(db: D1Database, evt: PulledDukigenEvent): Promise<void> {
    const now = Math.floor(Date.now() / 1000)

    switch (evt.eventType) {
        case DukigenEventType.AGENT_REGISTERED: {
            // eventData = abi.encode(AgentRegisteredData) = (string name, string agentURI)
            let name = ''
            let agentUri = ''
            try {
                const decoded = decodeAbiParameters(
                    [
                        { type: 'tuple', components: [
                            { name: 'name', type: 'string' },
                            { name: 'agentURI', type: 'string' },
                        ]}
                    ],
                    evt.eventData as `0x${string}`,
                )
                name = (decoded[0] as any).name ?? ''
                agentUri = (decoded[0] as any).agentURI ?? ''
            } catch {
                // fallback: event data may be malformed
            }

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
            // eventData = abi.encode(AgentURIUpdatedData) = (string newURI)
            let newUri = ''
            try {
                const decoded = decodeAbiParameters(
                    [{ type: 'tuple', components: [{ name: 'newURI', type: 'string' }] }],
                    evt.eventData as `0x${string}`,
                )
                newUri = (decoded[0] as any).newURI ?? ''
            } catch {}

            await db.prepare(`
                UPDATE dukigen_agents SET agent_uri = ?, updated_at = ?
                WHERE agent_id = ?
            `).bind(newUri, now, evt.agentId.toString()).run()
            break
        }

        case DukigenEventType.AGENT_APPROX_BPS_SET: {
            // eventData = abi.encode(AgentApproxBpsSetData) = (uint16 approxBps)
            let approxBps = 0
            try {
                const decoded = decodeAbiParameters(
                    [{ type: 'tuple', components: [
                        { name: 'approxBps', type: 'uint16' },
                    ]}],
                    evt.eventData as `0x${string}`,
                )
                const d = decoded[0] as any
                approxBps = Number(d.approxBps ?? 0)
            } catch {}

            await db.prepare(`
                UPDATE dukigen_agents SET approx_bps = ?, updated_at = ?
                WHERE agent_id = ?
            `).bind(approxBps, now, evt.agentId.toString()).run()
            break
        }

        case DukigenEventType.AGENT_WORKS_DATA_SET: {
            // eventData = abi.encode(AgentWorksDataSetData) = (uint8 productType, uint8 dukiType, string pledgeUrl, string[] tags)
            let productType = 0, dukiType = 0, pledgeUrl = '', tags: string[] = []
            try {
                const decoded = decodeAbiParameters(
                    [{ type: 'tuple', components: [
                        { name: 'productType', type: 'uint8' },
                        { name: 'dukiType', type: 'uint8' },
                        { name: 'pledgeUrl', type: 'string' },
                        { name: 'tags', type: 'string[]' },
                    ]}],
                    evt.eventData as `0x${string}`,
                )
                const d = decoded[0] as any
                productType = Number(d.productType ?? 0)
                dukiType = Number(d.dukiType ?? 0)
                pledgeUrl = d.pledgeUrl ?? ''
                tags = d.tags ?? []
            } catch {}

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

