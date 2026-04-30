/**
 * dukigen-event-service.ts — Persist DukigenRegistry events and materialize agents.
 */

import type { DukigenRegistryEvent, SnapshotValue } from '@repo/dukiregistry-apidefs'
import { DukigenEventType, DukigenEventDataSchema, SnapshotValueSchema } from '@repo/dukiregistry-apidefs'
import { toBinary } from '@bufbuild/protobuf'

/**
 * Persist a raw DukigenEvent to the dukigen_registry_events table.
 * Stores the proto-serialized DukigenEventData as a BLOB in event_data.
 */
export async function persistDukigenEvent(db: D1Database, evt: DukigenRegistryEvent): Promise<void> {
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
        evt.eventData ? toBinary(DukigenEventDataSchema, evt.eventData) : null,
    ).run()
}

/**
 * Materialize agent state from a DukigenEvent.
 * Reads typed payloads from the proto DukigenEventData wrapper.
 */
export async function materializeAgent(db: D1Database, evt: DukigenRegistryEvent): Promise<void> {
    const now = Math.floor(Date.now() / 1000)

    switch (evt.eventType) {
        case DukigenEventType.AGENT_CREATED: {
            if (evt.eventData?.payload.case !== 'agentCreated') break
            const d = evt.eventData.payload.value
            const name = d.name ?? ''
            const agentUri = d.agentUri ?? ''
            const agentUriHash = d.agentUriHash ?? ''
            const website = d.website ?? ''
            const approxBps = Number(d.approxBps ?? 0)
            const credibilityWallet = d.credibilityWallet ?? evt.ego
            const productType = Number(d.productType ?? 0)
            const dukiType = Number(d.dukiType ?? 0)
            const pledgeUrl = d.pledgeUrl ?? ''
            const opContracts = (d.opContracts ?? []).map((c) => ({
                chainEid: Number(c.chainEid),
                contractAddr: c.contractAddr,
            }))

            await db.prepare(`
                INSERT OR REPLACE INTO dukigen_agents
                (agent_id, name, agent_uri, agent_uri_hash, owner, chain_eid,
                 approx_bps, product_type, duki_type, pledge_url, website, credibility_wallet,
                 op_contracts, credibility_d6, credibility_snapshot, mint_credibility_d6, mint_credibility_snapshot,
                 created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                credibilityWallet,
                JSON.stringify(opContracts),
                0,
                null,
                0,
                null,
                Number(evt.evtTime),
                now,
            ).run()
            break
        }

        case DukigenEventType.AGENT_URI_UPDATED: {
            if (evt.eventData?.payload.case !== 'agentUriUpdated') break
            const d = evt.eventData.payload.value
            const agentUri = d.agentUri ?? ''
            const agentUriHash = d.agentUriHash ?? ''

            await db.prepare(`
                UPDATE dukigen_agents SET agent_uri = ?, agent_uri_hash = ?, updated_at = ?
                WHERE agent_id = ?
            `).bind(agentUri, agentUriHash, now, evt.agentId.toString()).run()
            break
        }

        case DukigenEventType.AGENT_APPROX_BPS_SET: {
            if (evt.eventData?.payload.case !== 'agentApproxBpsSet') break
            const approxBps = Number(evt.eventData.payload.value.approxBps ?? 0)

            await db.prepare(`
                UPDATE dukigen_agents SET approx_bps = ?, updated_at = ?
                WHERE agent_id = ?
            `).bind(approxBps, now, evt.agentId.toString()).run()
            break
        }

        case DukigenEventType.AGENT_WORKS_DATA_SET: {
            if (evt.eventData?.payload.case !== 'agentWorksDataSet') break
            const d = evt.eventData.payload.value
            const productType = Number(d.productType ?? 0)
            const dukiType = Number(d.dukiType ?? 0)
            const pledgeUrl = d.pledgeUrl ?? ''
            const website = d.website ?? ''

            await db.prepare(`
                UPDATE dukigen_agents SET product_type = ?, duki_type = ?, pledge_url = ?, website = ?, updated_at = ?
                WHERE agent_id = ?
            `).bind(productType, dukiType, pledgeUrl, website, now, evt.agentId.toString()).run()
            break
        }

        case DukigenEventType.AGENT_CREDIBILITY_WALLET_SET: {
            if (evt.eventData?.payload.case !== 'agentCredibilityWalletSet') break
            const credibilityWallet = evt.eventData.payload.value.credibilityWallet ?? ''

            await db.prepare(`
                UPDATE dukigen_agents SET credibility_wallet = ?, updated_at = ?
                WHERE agent_id = ?
            `).bind(credibilityWallet, now, evt.agentId.toString()).run()
            break
        }

        case DukigenEventType.AGENT_OP_CONTRACT_SET: {
            if (evt.eventData?.payload.case !== 'agentOpContractSet') break
            // Upsert one (chainEid, contractAddr) entry into the JSON-array column.
            const chainEid = Number(evt.eventData.payload.value.chainEid)
            const contractAddr = evt.eventData.payload.value.contractAddr ?? ''

            const row = await db.prepare(
                `SELECT op_contracts FROM dukigen_agents WHERE agent_id = ?`
            ).bind(evt.agentId.toString()).first<{ op_contracts?: string }>()

            const list: { chainEid: number; contractAddr: string }[] = (() => {
                try { return row?.op_contracts ? JSON.parse(row.op_contracts) : [] }
                catch { return [] }
            })()
            const idx = list.findIndex(c => Number(c.chainEid) === chainEid)
            if (idx >= 0) list[idx].contractAddr = contractAddr
            else list.push({ chainEid, contractAddr })

            await db.prepare(`
                UPDATE dukigen_agents SET op_contracts = ?, updated_at = ?
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
export async function processDukigenEvents(db: D1Database, events: DukigenRegistryEvent[]): Promise<void> {
    for (const evt of events) {
        await persistDukigenEvent(db, evt)
        await materializeAgent(db, evt)
    }
}

export async function updateAgentCredibility(
    db: D1Database,
    agentId: string,
    credibilityD6: bigint,
    credibilitySnapshot: SnapshotValue | null,
    mintCredibilityD6: bigint,
    mintCredibilitySnapshot: SnapshotValue | null,
): Promise<void> {
    await db.prepare(`
        UPDATE dukigen_agents
        SET credibility_d6 = ?, credibility_snapshot = ?,
            mint_credibility_d6 = ?, mint_credibility_snapshot = ?,
            updated_at = ?
        WHERE agent_id = ?
    `).bind(
        Number(credibilityD6),
        credibilitySnapshot ? toBinary(SnapshotValueSchema, credibilitySnapshot) : null,
        Number(mintCredibilityD6),
        mintCredibilitySnapshot ? toBinary(SnapshotValueSchema, mintCredibilitySnapshot) : null,
        Math.floor(Date.now() / 1000),
        agentId,
    ).run()
}
