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
            const d = decodeEventPayload<{
                name: string; agentURI: string; agentURIHash?: string; website?: string;
                approxBps?: number | bigint; agentWallet?: string;
                productType?: number | bigint; dukiType?: number | bigint; pledgeUrl?: string;
                chainContracts?: readonly { chainEid: number | bigint; contractAddr: string }[];
            }>(
                dukigenRegistryAbi, 'AgentRegisteredData', evt.eventData,
            )
            const name = d?.name ?? ''
            const agentUri = d?.agentURI ?? ''
            const agentUriHash = d?.agentURIHash ?? ''
            const website = d?.website ?? ''
            const approxBps = Number(d?.approxBps ?? 0)
            const agentWallet = d?.agentWallet ?? evt.ego
            const productType = Number(d?.productType ?? 0)
            const dukiType = Number(d?.dukiType ?? 0)
            const pledgeUrl = d?.pledgeUrl ?? ''
            const chainContracts = (d?.chainContracts ?? []).map(c => ({
                chainEid: Number(c.chainEid),
                contractAddr: c.contractAddr,
            }))

            await db.prepare(`
                INSERT OR REPLACE INTO dukigen_agents
                (agent_id, name, agent_uri, agent_uri_hash, owner, origin_chain_eid,
                 approx_bps, product_type, duki_type, pledge_url, website, agent_wallet,
                 chain_contracts, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                evt.agentId.toString(),
                name,
                agentUri,
                agentUriHash,
                evt.ego,
                evt.chainEid,
                approxBps,
                productType,
                dukiType,
                pledgeUrl,
                website,
                agentWallet,
                JSON.stringify(chainContracts),
                Number(evt.evtTime),
                now,
            ).run()
            break
        }

        case DukigenEventType.AGENT_URI_UPDATED: {
            const d = decodeEventPayload<{ newURI: string; newURIHash?: string }>(
                dukigenRegistryAbi, 'AgentURIUpdatedData', evt.eventData,
            )
            const newUri = d?.newURI ?? ''
            const newUriHash = d?.newURIHash ?? ''

            await db.prepare(`
                UPDATE dukigen_agents SET agent_uri = ?, agent_uri_hash = ?, updated_at = ?
                WHERE agent_id = ?
            `).bind(newUri, newUriHash, now, evt.agentId.toString()).run()
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
                pledgeUrl: string; website: string;
            }>(dukigenRegistryAbi, 'AgentWorksDataSetData', evt.eventData)
            const productType = Number(d?.productType ?? 0)
            const dukiType = Number(d?.dukiType ?? 0)
            const pledgeUrl = d?.pledgeUrl ?? ''
            const website = d?.website ?? ''

            await db.prepare(`
                UPDATE dukigen_agents SET product_type = ?, duki_type = ?, pledge_url = ?, website = ?, updated_at = ?
                WHERE agent_id = ?
            `).bind(productType, dukiType, pledgeUrl, website, now, evt.agentId.toString()).run()
            break
        }

        case DukigenEventType.AGENT_WALLET_SET: {
            const d = decodeEventPayload<{ newWallet: string }>(
                dukigenRegistryAbi, 'AgentWalletSetData', evt.eventData,
            )
            const newWallet = d?.newWallet ?? ''

            await db.prepare(`
                UPDATE dukigen_agents SET agent_wallet = ?, updated_at = ?
                WHERE agent_id = ?
            `).bind(newWallet, now, evt.agentId.toString()).run()
            break
        }

        case DukigenEventType.AGENT_CHAIN_CONTRACT_SET: {
            // Upsert one (chainEid, contractAddr) entry into the JSON-array column.
            const d = decodeEventPayload<{ chainEid: number | bigint; contractAddr: string }>(
                dukigenRegistryAbi, 'AgentChainContractSetData', evt.eventData,
            )
            if (!d) break
            const chainEid = Number(d.chainEid)
            const contractAddr = d.contractAddr ?? ''

            const row = await db.prepare(
                `SELECT chain_contracts FROM dukigen_agents WHERE agent_id = ?`
            ).bind(evt.agentId.toString()).first<{ chain_contracts?: string }>()

            const list: { chainEid: number; contractAddr: string }[] = (() => {
                try { return row?.chain_contracts ? JSON.parse(row.chain_contracts) : [] }
                catch { return [] }
            })()
            const idx = list.findIndex(c => Number(c.chainEid) === chainEid)
            if (idx >= 0) list[idx].contractAddr = contractAddr
            else list.push({ chainEid, contractAddr })

            await db.prepare(`
                UPDATE dukigen_agents SET chain_contracts = ?, updated_at = ?
                WHERE agent_id = ?
            `).bind(JSON.stringify(list), now, evt.agentId.toString()).run()
            break
        }

        default:
            // METADATA_SET — log only for now
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
