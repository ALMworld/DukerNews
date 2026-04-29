/**
 * chain-puller.ts — Fetch tx receipts from chain and extract registry events.
 */

import { createPublicClient, http, decodeEventLog, type Log } from 'viem'
import { getChainConfig, DUKER_EVENT_ABI, DUKIGEN_EVENT_ABI } from '../config'
import { create } from '@bufbuild/protobuf'
import {
    DukerRegistryEvent,
    DukigenRegistryEvent,
    DukerRegistryEventSchema,
    DukigenRegistryEventSchema,
    DukerEventDataSchema,
    DukigenEventDataSchema,
    IdentityBurnedPayloadSchema,
    ProfileUpdatedPayloadSchema,
    AgentCreatedPayloadSchema,
    AgentURIUpdatedPayloadSchema,
    AgentApproxBpsSetPayloadSchema,
    AgentWorksDataSetPayloadSchema,
    AgentMetadataSetPayloadSchema,
    AgentCredibilityWalletSetPayloadSchema,
    AgentOpContractSetPayloadSchema,
    ChainContractEntrySchema
} from '@repo/dukiregistry-apidefs'
import { DukerEventType, DukigenEventType } from '@repo/dukiregistry-apidefs'
import { dukerRegistryAbi, dukigenRegistryAbi } from 'contract-duki-alm-world'
import { decodeEventPayload } from './event-payload'

function hexToBytes(hex: string): Uint8Array {
    const stripped = hex.startsWith('0x') ? hex.slice(2) : hex
    const out = new Uint8Array(stripped.length / 2)
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16)
    }
    return out
}

export interface PulledReceipt {
    dukerEvents: DukerRegistryEvent[]
    dukigenEvents: DukigenRegistryEvent[]
}

/**
 * Pull a transaction receipt and extract DukerEvent + DukigenEvent logs.
 */
export async function pullTxReceipt(chainEid: number, txHash: string): Promise<PulledReceipt> {
    const cfg = getChainConfig(chainEid)
    const client = createPublicClient({
        transport: http(cfg.rpcUrl),
    })

    const receipt = await client.getTransactionReceipt({
        hash: txHash as `0x${string}`,
    })

    const dukerEvents: DukerRegistryEvent[] = []
    const dukigenEvents: DukigenRegistryEvent[] = []

    for (const log of receipt.logs) {
        try {
            const addr = log.address.toLowerCase()
            if (addr === cfg.dukerRegistryAddress.toLowerCase()) {
                const parsed = parseDukerLog(log, chainEid, txHash, receipt.blockNumber)
                if (parsed) dukerEvents.push(parsed)
            }
            else if (addr === cfg.dukigenRegistryAddress.toLowerCase()) {
                const parsed = parseDukigenLog(log, chainEid, txHash, receipt.blockNumber)
                if (parsed) dukigenEvents.push(parsed)
            }
        } catch {
            // Not a matching event — skip
        }
    }

    return { dukerEvents, dukigenEvents }
}


function parseDukerLog(log: Log, chainEid: number, txHash: string, blockNumber: bigint): DukerRegistryEvent | null {
    if (!log.topics[0] || !log.topics[1] || !log.topics[2]) return null
    try {
        const decoded = decodeEventLog({
            abi: DUKER_EVENT_ABI,
            data: log.data,
            topics: log.topics as any,
        })
        const args = decoded.args as any
        const eventType = Number(args.eventType)
        const eventDataHex = log.data

        let eventData = create(DukerEventDataSchema, {})
        switch (eventType) {
            case DukerEventType.IDENTITY_BURNED: {
                const d = decodeEventPayload(dukerRegistryAbi, 'IdentityBurnedData', eventDataHex)
                if (d) eventData = create(DukerEventDataSchema, {
                    payload: { case: 'identityBurned', value: create(IdentityBurnedPayloadSchema, { chainEid: Number(d.chainEid) }) }
                })
                break
            }
            case DukerEventType.PROFILE_UPDATED: {
                const d = decodeEventPayload(dukerRegistryAbi, 'ProfileUpdatedData', eventDataHex)
                if (d) eventData = create(DukerEventDataSchema, {
                    payload: { case: 'profileUpdated', value: create(ProfileUpdatedPayloadSchema, { bio: d.bio ?? '', website: d.website ?? '' }) }
                })
                break
            }
        }

        return create(DukerRegistryEventSchema, {
            chainEid,
            evtSeq: args.evtSeq,
            tokenId: args.tokenId,
            eventType,
            ego: args.ego.toLowerCase(),
            username: args.username,
            evtTime: args.evtTime,
            txHash,
            blockNumber,
            eventData,
        })
    } catch {
        return null
    }
}



function parseDukigenLog(log: Log, chainEid: number, txHash: string, blockNumber: bigint): DukigenRegistryEvent | null {
    try {
        const decoded = decodeEventLog({
            abi: DUKIGEN_EVENT_ABI,
            data: log.data,
            topics: log.topics as any,
        })
        const args = decoded.args as any
        const eventType = Number(args.eventType)
        const eventDataHex = args.eventData

        let eventData = create(DukigenEventDataSchema, {})
        switch (eventType) {
            case DukigenEventType.AGENT_CREATED: {
                const d = decodeEventPayload(dukigenRegistryAbi, 'AgentCreatedData', eventDataHex)
                if (d) eventData = create(DukigenEventDataSchema, {
                    payload: {
                        case: 'agentCreated',
                        value: create(AgentCreatedPayloadSchema, {
                            name: d.name ?? '',
                            agentUri: d.agentURI ?? '',
                            agentUriHash: d.agentURIHash ?? '',
                            website: d.website ?? '',
                            approxBps: Number(d.approxBps ?? 0),
                            credibilityWallet: d.credibilityWallet ?? '',
                            productType: Number(d.productType ?? 0),
                            dukiType: Number(d.dukiType ?? 0),
                            pledgeUrl: d.pledgeUrl ?? '',
                            opContracts: (d.opContracts ?? []).map((c: any) =>
                                create(ChainContractEntrySchema, {
                                    chainEid: Number(c.chainEid),
                                    contractAddr: c.contractAddr ?? '',
                                })
                            ),
                        })
                    }
                })
                break
            }
            case DukigenEventType.AGENT_URI_UPDATED: {
                const d = decodeEventPayload(dukigenRegistryAbi, 'AgentURIUpdatedData', eventDataHex)
                if (d) eventData = create(DukigenEventDataSchema, {
                    payload: { case: 'agentUriUpdated', value: create(AgentURIUpdatedPayloadSchema, { agentUri: d.agentURI ?? '', agentUriHash: d.agentURIHash ?? '' }) }
                })
                break
            }
            case DukigenEventType.AGENT_APPROX_BPS_SET: {
                const d = decodeEventPayload(dukigenRegistryAbi, 'AgentApproxBpsSetData', eventDataHex)
                if (d) eventData = create(DukigenEventDataSchema, {
                    payload: { case: 'agentApproxBpsSet', value: create(AgentApproxBpsSetPayloadSchema, { approxBps: Number(d.approxBps ?? 0) }) }
                })
                break
            }
            case DukigenEventType.AGENT_WORKS_DATA_SET: {
                const d = decodeEventPayload(dukigenRegistryAbi, 'AgentWorksDataSetData', eventDataHex)
                if (d) eventData = create(DukigenEventDataSchema, {
                    payload: { case: 'agentWorksDataSet', value: create(AgentWorksDataSetPayloadSchema, { productType: Number(d.productType ?? 0), dukiType: Number(d.dukiType ?? 0), pledgeUrl: d.pledgeUrl ?? '', website: d.website ?? '' }) }
                })
                break
            }
            case DukigenEventType.AGENT_METADATA_SET: {
                const d = decodeEventPayload(dukigenRegistryAbi, 'AgentMetadataSetData', eventDataHex)
                if (d) eventData = create(DukigenEventDataSchema, {
                    payload: { case: 'agentMetadataSet', value: create(AgentMetadataSetPayloadSchema, { key: d.key ?? '', value: d.value ? hexToBytes(d.value) : new Uint8Array() }) }
                })
                break
            }
            case DukigenEventType.AGENT_CREDIBILITY_WALLET_SET: {
                const d = decodeEventPayload(dukigenRegistryAbi, 'AgentCredibilityWalletSetData', eventDataHex)
                if (d) eventData = create(DukigenEventDataSchema, {
                    payload: { case: 'agentCredibilityWalletSet', value: create(AgentCredibilityWalletSetPayloadSchema, { credibilityWallet: d.credibilityWallet ?? '' }) }
                })
                break
            }
            case DukigenEventType.AGENT_OP_CONTRACT_SET: {
                const d = decodeEventPayload(dukigenRegistryAbi, 'AgentOpContractSetData', eventDataHex)
                if (d) eventData = create(DukigenEventDataSchema, {
                    payload: { case: 'agentOpContractSet', value: create(AgentOpContractSetPayloadSchema, { chainEid: Number(d.chainEid ?? 0), contractAddr: d.contractAddr ?? '' }) }
                })
                break
            }
        }

        return create(DukigenRegistryEventSchema, {
            chainEid,
            evtSeq: args.evtSeq,
            agentId: args.agentId,
            eventType,
            ego: args.ego.toLowerCase(),
            evtTime: args.evtTime,
            txHash,
            blockNumber,
            eventData,
        })
    } catch {
        return null
    }
}


// ── Block range log pulling (for SyncEvents catch-up) ────────────────

/**
 * Pull DukerEvent logs from a block range using eth_getLogs.
 */
export async function pullDukerEventsByBlockRange(
    chainEid: number,
    fromBlock: bigint,
    toBlock: bigint,
): Promise<DukerRegistryEvent[]> {
    const cfg = getChainConfig(chainEid)
    const client = createPublicClient({ transport: http(cfg.rpcUrl) })

    const logs = await client.getLogs({
        address: cfg.dukerRegistryAddress,
        events: DUKER_EVENT_ABI,
        fromBlock,
        toBlock,
    })

    const events: DukerRegistryEvent[] = []
    for (const log of logs) {
        const parsed = parseDukerLog(log as any, chainEid, log.transactionHash ?? '', log.blockNumber ?? 0n)
        if (parsed) events.push(parsed)
    }
    return events
}

/**
 * Pull DukigenEvent logs from a block range using eth_getLogs.
 */
export async function pullDukigenEventsByBlockRange(
    chainEid: number,
    fromBlock: bigint,
    toBlock: bigint,
): Promise<DukigenRegistryEvent[]> {
    const cfg = getChainConfig(chainEid)
    const client = createPublicClient({ transport: http(cfg.rpcUrl) })

    const logs = await client.getLogs({
        address: cfg.dukigenRegistryAddress,
        events: DUKIGEN_EVENT_ABI,
        fromBlock,
        toBlock,
    })

    const events: DukigenRegistryEvent[] = []
    for (const log of logs) {
        const parsed = parseDukigenLog(log as any, chainEid, log.transactionHash ?? '', log.blockNumber ?? 0n)
        if (parsed) events.push(parsed)
    }
    return events
}
