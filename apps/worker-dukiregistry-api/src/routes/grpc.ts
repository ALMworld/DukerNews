/**
 * grpc.ts — ConnectRPC handlers for DukerRegistryService + DukigenRegistryService.
 */

import type { ConnectRouter } from '@connectrpc/connect'
import { create } from '@bufbuild/protobuf'
import {
    DukerRegistryService,
    DukigenRegistryService,
    GetUsernameRespSchema,
    CheckUsernameRespSchema,
    NotifyDukerTxRespSchema,
    NotifyDukigenTxRespSchema,
    GetAgentsRespSchema,
    DukerRegistryEventSchema,
    DukigenRegistryEventSchema,
    SyncEventsRespSchema,
    DukerEventType,
    DukigenEventType,
    IdentityBurnedPayloadSchema,
    ProfileUpdatedPayloadSchema,
    AgentRegisteredPayloadSchema,
    AgentURIUpdatedPayloadSchema,
    AgentApproxBpsSetPayloadSchema,
    AgentWorksDataSetPayloadSchema,
    AgentMetadataSetPayloadSchema,
    AgentWalletSetPayloadSchema,
    AgentChainContractSetPayloadSchema,
} from '@repo/dukiregistry-apidefs'
import type { DukerRegistryEvent, DukigenRegistryEvent } from '@repo/dukiregistry-apidefs'
import {
    DukerIdentitySchema,
    DukigenAgentSchema,
} from '@repo/dukiregistry-apidefs'
import { pullTxReceipt, pullDukerEventsByBlockRange, pullDukigenEventsByBlockRange } from '../services/chain-puller'
import type { PulledDukerEvent, PulledDukigenEvent } from '../services/chain-puller'
import { processDukerEvents } from '../services/duker-event-service'
import { processDukigenEvents } from '../services/dukigen-event-service'
import { createPublicClient, http, decodeAbiParameters } from 'viem'
import { getChainConfig } from '../config'
import { dukerRegistryAbi, dukigenRegistryAbi } from 'contract-duki-alm-world'

// Store reference for context access — set from index.ts
let _db: D1Database

export function setDb(db: D1Database) {
    _db = db
}

// ── ABI decode helpers — raw hex eventData → typed oneof ────────────────

function decodeDukerEventData(evt: PulledDukerEvent): DukerRegistryEvent['eventData'] {
    try {
        switch (evt.eventType) {
            case DukerEventType.IDENTITY_BURNED: {
                const decoded = decodeAbiParameters(
                    [{ type: 'tuple', components: [{ name: 'chainEid', type: 'uint24' }] }],
                    evt.eventData as `0x${string}`,
                )
                return {
                    case: 'identityBurned' as const,
                    value: create(IdentityBurnedPayloadSchema, {
                        chainEid: Number((decoded[0] as any).chainEid),
                    }),
                }
            }
            case DukerEventType.PROFILE_UPDATED: {
                const decoded = decodeAbiParameters(
                    [{ type: 'tuple', components: [
                        { name: 'bio', type: 'string' },
                        { name: 'website', type: 'string' },
                    ]}],
                    evt.eventData as `0x${string}`,
                )
                const d = decoded[0] as any
                return {
                    case: 'profileUpdated' as const,
                    value: create(ProfileUpdatedPayloadSchema, {
                        bio: d.bio ?? '',
                        website: d.website ?? '',
                    }),
                }
            }
            default:
                return { case: undefined, value: undefined }
        }
    } catch {
        return { case: undefined, value: undefined }
    }
}

function decodeDukigenEventData(evt: PulledDukigenEvent): DukigenRegistryEvent['eventData'] {
    try {
        switch (evt.eventType) {
            case DukigenEventType.AGENT_REGISTERED: {
                const decoded = decodeAbiParameters(
                    [{ type: 'tuple', components: [
                        { name: 'name', type: 'string' },
                        { name: 'agentURI', type: 'string' },
                        { name: 'website', type: 'string' },
                        { name: 'approxBps', type: 'uint16' },
                        { name: 'agentWallet', type: 'address' },
                        { name: 'productType', type: 'uint8' },
                        { name: 'dukiType', type: 'uint8' },
                        { name: 'pledgeUrl', type: 'string' },
                        { name: 'tags', type: 'string[]' },
                    ]}],
                    evt.eventData as `0x${string}`,
                )
                const d = decoded[0] as any
                return {
                    case: 'agentRegistered' as const,
                    value: create(AgentRegisteredPayloadSchema, {
                        name: d.name ?? '',
                        agentUri: d.agentURI ?? '',
                        website: d.website ?? '',
                        approxBps: Number(d.approxBps ?? 0),
                        agentWallet: d.agentWallet ?? '',
                        productType: Number(d.productType ?? 0),
                        dukiType: Number(d.dukiType ?? 0),
                        pledgeUrl: d.pledgeUrl ?? '',
                        tags: d.tags ?? [],
                    }),
                }
            }
            case DukigenEventType.AGENT_URI_UPDATED: {
                const decoded = decodeAbiParameters(
                    [{ type: 'tuple', components: [{ name: 'newURI', type: 'string' }] }],
                    evt.eventData as `0x${string}`,
                )
                return {
                    case: 'agentUriUpdated' as const,
                    value: create(AgentURIUpdatedPayloadSchema, {
                        newUri: (decoded[0] as any).newURI ?? '',
                    }),
                }
            }
            case DukigenEventType.AGENT_APPROX_BPS_SET: {
                const decoded = decodeAbiParameters(
                    [{ type: 'tuple', components: [
                        { name: 'approxBps', type: 'uint16' },
                    ]}],
                    evt.eventData as `0x${string}`,
                )
                const d = decoded[0] as any
                return {
                    case: 'agentApproxBpsSet' as const,
                    value: create(AgentApproxBpsSetPayloadSchema, {
                        approxBps: Number(d.approxBps ?? 0),
                    }),
                }
            }
            case DukigenEventType.AGENT_WORKS_DATA_SET: {
                const decoded = decodeAbiParameters(
                    [{ type: 'tuple', components: [
                        { name: 'productType', type: 'uint8' },
                        { name: 'dukiType', type: 'uint8' },
                        { name: 'pledgeUrl', type: 'string' },
                        { name: 'tags', type: 'string[]' },
                        { name: 'website', type: 'string' },
                    ]}],
                    evt.eventData as `0x${string}`,
                )
                const d = decoded[0] as any
                return {
                    case: 'agentWorksDataSet' as const,
                    value: create(AgentWorksDataSetPayloadSchema, {
                        productType: Number(d.productType ?? 0),
                        dukiType: Number(d.dukiType ?? 0),
                        pledgeUrl: d.pledgeUrl ?? '',
                        tags: d.tags ?? [],
                        website: d.website ?? '',
                    }),
                }
            }
            case DukigenEventType.AGENT_METADATA_SET: {
                const decoded = decodeAbiParameters(
                    [{ type: 'tuple', components: [
                        { name: 'key', type: 'string' },
                        { name: 'value', type: 'bytes' },
                    ]}],
                    evt.eventData as `0x${string}`,
                )
                const d = decoded[0] as any
                return {
                    case: 'agentMetadataSet' as const,
                    value: create(AgentMetadataSetPayloadSchema, {
                        key: d.key ?? '',
                        value: d.value ? new Uint8Array(Buffer.from((d.value as string).slice(2), 'hex')) : new Uint8Array(),
                    }),
                }
            }
            case DukigenEventType.AGENT_WALLET_SET: {
                const decoded = decodeAbiParameters(
                    [{ type: 'tuple', components: [{ name: 'newWallet', type: 'address' }] }],
                    evt.eventData as `0x${string}`,
                )
                return {
                    case: 'agentWalletSet' as const,
                    value: create(AgentWalletSetPayloadSchema, {
                        newWallet: (decoded[0] as any).newWallet ?? '',
                    }),
                }
            }
            case DukigenEventType.AGENT_CHAIN_CONTRACT_SET: {
                const decoded = decodeAbiParameters(
                    [{ type: 'tuple', components: [
                        { name: 'chainEid', type: 'uint32' },
                        { name: 'contractAddr', type: 'address' },
                    ]}],
                    evt.eventData as `0x${string}`,
                )
                const d = decoded[0] as any
                return {
                    case: 'agentChainContractSet' as const,
                    value: create(AgentChainContractSetPayloadSchema, {
                        chainEid: Number(d.chainEid ?? 0),
                        contractAddr: d.contractAddr ?? '',
                    }),
                }
            }
            default:
                return { case: undefined, value: undefined }
        }
    } catch {
        return { case: undefined, value: undefined }
    }
}



export function registerGrpcRoutes(router: ConnectRouter) {
    // ── DukerRegistryService ────────────────────────────────

    router.service(DukerRegistryService, {
        async getUsername(req) {
            const resp = create(GetUsernameRespSchema, {})

            let query = 'SELECT * FROM duker_users WHERE ego = ? COLLATE NOCASE AND status = ?'
            const params: any[] = [req.address, 'active']

            if (req.chainEid > 0) {
                query += ' AND chain_eid = ?'
                params.push(req.chainEid)
            }
            query += ' LIMIT 1'

            const row = await _db.prepare(query).bind(...params).first<any>()
            if (row) {
                resp.identity = create(DukerIdentitySchema, {
                    username: row.username,
                    chainEid: row.chain_eid,
                    tokenId: row.token_id,
                    ego: row.ego,
                    bio: row.bio ?? '',
                    website: row.website ?? '',
                })
            }
            return resp
        },

        async checkUsername(req) {
            let query = 'SELECT * FROM duker_users WHERE username = ? COLLATE NOCASE AND status = ?'
            const params: any[] = [req.username, 'active']

            if (req.chainEid > 0) {
                query += ' AND chain_eid = ?'
                params.push(req.chainEid)
            }
            query += ' LIMIT 1'

            const row = await _db.prepare(query).bind(...params).first<any>()

            if (row) {
                return create(CheckUsernameRespSchema, {
                    available: false,
                    owner: create(DukerIdentitySchema, {
                        username: row.username,
                        chainEid: row.chain_eid,
                        tokenId: row.token_id,
                        ego: row.ego,
                    }),
                })
            }
            return create(CheckUsernameRespSchema, { available: true })
        },

        async getIdentitiesByToken(req) {
            const resp = create(GetUsernameRespSchema, {})

            const row = await _db.prepare(
                'SELECT * FROM duker_users WHERE token_id = ? AND status = ? LIMIT 1'
            ).bind(req.tokenId, 'active').first<any>()

            if (row) {
                resp.identity = create(DukerIdentitySchema, {
                    username: row.username,
                    chainEid: row.chain_eid,
                    tokenId: row.token_id,
                    ego: row.ego,
                    bio: row.bio ?? '',
                    website: row.website ?? '',
                })
            }
            return resp
        },

        async notifyDukerTx(req) {
            const resp = create(NotifyDukerTxRespSchema, {})

            const pulled = await pullTxReceipt(req.chainEid, req.txHash)
            await processDukerEvents(_db, pulled.dukerEvents)

            // Return parsed events as proto messages with typed payloads
            resp.events = pulled.dukerEvents.map(evt =>
                create(DukerRegistryEventSchema, {
                    chainEid: evt.chainEid,
                    evtSeq: evt.evtSeq,
                    tokenId: evt.tokenId.toString(),
                    eventType: evt.eventType,
                    ego: evt.ego,
                    username: evt.username,
                    evtTime: evt.evtTime,
                    txHash: evt.txHash,
                    blockNumber: evt.blockNumber,
                    eventData: decodeDukerEventData(evt),
                })
            )
            return resp
        },

        async syncDukerEvents(req) {
            const DEFAULT_MAX_BLOCK_RANGE = 10000n
            const maxRange = req.maxBlockRange > 0n ? req.maxBlockRange : DEFAULT_MAX_BLOCK_RANGE
            const cfg = getChainConfig(req.chainEid)
            const client = createPublicClient({ transport: http(cfg.rpcUrl) })

            // Read on-chain state in one call: evtSeq + all 4 block checkpoints
            const [chainEvtSeq, checkpoints] = await client.readContract({
                address: cfg.dukerRegistryAddress,
                abi: dukerRegistryAbi,
                functionName: 'eventState',
            })

            if (Number(chainEvtSeq) === 0 || Number(chainEvtSeq) <= Number(req.lastEvtSeq)) {
                return create(SyncEventsRespSchema, {
                    syncedUpTo: chainEvtSeq as bigint,
                    eventsIndexed: 0,
                    chainEvtSeq: chainEvtSeq as bigint,
                })
            }

            // Find best fromBlock from checkpoints
            const fromBlock = findBestCheckpoint(checkpoints, Number(req.lastEvtSeq))
            const latestBlock = await client.getBlockNumber()
            const toBlock = fromBlock + maxRange < latestBlock ? fromBlock + maxRange : latestBlock

            // Pull and index events
            const events = await pullDukerEventsByBlockRange(req.chainEid, fromBlock, toBlock)
            // Filter to only events after lastEvtSeq
            const newEvents = events.filter(e => Number(e.evtSeq) > Number(req.lastEvtSeq))
            await processDukerEvents(_db, newEvents)

            const syncedUpTo = newEvents.length > 0
                ? BigInt(newEvents[newEvents.length - 1].evtSeq)
                : req.lastEvtSeq

            return create(SyncEventsRespSchema, {
                syncedUpTo,
                eventsIndexed: newEvents.length,
                chainEvtSeq: chainEvtSeq as bigint,
            })
        },
    })

    // ── DukigenRegistryService ───────────────────────────────

    router.service(DukigenRegistryService, {
        async getAgent(req) {
            const row = await _db.prepare(
                'SELECT * FROM dukigen_agents WHERE agent_id = ?'
            ).bind(req.agentId.toString()).first<any>()

            if (!row) {
                return create(DukigenAgentSchema, {})
            }

            return create(DukigenAgentSchema, {
                agentId: BigInt(row.agent_id),
                name: row.name,
                agentUri: row.agent_uri,
                owner: row.owner,
                originChainEid: row.origin_chain_eid,
                approxBps: row.approx_bps ?? row.default_duki_bps ?? 0,
                productType: row.product_type,
                dukiType: row.duki_type,
                pledgeUrl: row.pledge_url,
                tags: JSON.parse(row.tags || '[]'),
                website: row.website ?? '',
            })
        },

        async getAgents(req) {
            const page = Math.max(1, req.page || 1)
            const perPage = Math.min(100, Math.max(1, req.perPage || 20))
            const offset = (page - 1) * perPage

            const countResult = await _db.prepare('SELECT COUNT(*) as cnt FROM dukigen_agents').first<any>()
            const total = countResult?.cnt ?? 0

            const rows = await _db.prepare(
                'SELECT * FROM dukigen_agents ORDER BY created_at DESC LIMIT ? OFFSET ?'
            ).bind(perPage, offset).all<any>()

            return create(GetAgentsRespSchema, {
                total,
                agents: (rows.results ?? []).map((row: any) =>
                    create(DukigenAgentSchema, {
                        agentId: BigInt(row.agent_id),
                        name: row.name,
                        agentUri: row.agent_uri,
                        owner: row.owner,
                        originChainEid: row.origin_chain_eid,
                        approxBps: row.approx_bps ?? row.default_duki_bps ?? 0,
                    })
                ),
            })
        },

        async notifyDukigenTx(req) {
            const resp = create(NotifyDukigenTxRespSchema, {})

            const pulled = await pullTxReceipt(req.chainEid, req.txHash)
            await processDukigenEvents(_db, pulled.dukigenEvents)

            resp.events = pulled.dukigenEvents.map(evt =>
                create(DukigenRegistryEventSchema, {
                    chainEid: evt.chainEid,
                    evtSeq: evt.evtSeq,
                    agentId: evt.agentId,
                    eventType: evt.eventType,
                    ego: evt.ego,
                    evtTime: evt.evtTime,
                    txHash: evt.txHash,
                    blockNumber: evt.blockNumber,
                    eventData: decodeDukigenEventData(evt),
                })
            )
            return resp
        },

        async syncDukigenEvents(req) {
            const DEFAULT_MAX_BLOCK_RANGE = 10000n
            const maxRange = req.maxBlockRange > 0n ? req.maxBlockRange : DEFAULT_MAX_BLOCK_RANGE
            const cfg = getChainConfig(req.chainEid)
            const client = createPublicClient({ transport: http(cfg.rpcUrl) })

            // Read on-chain state in one call: evtSeq + all 4 block checkpoints
            const [chainEvtSeq, checkpoints] = await client.readContract({
                address: cfg.dukigenRegistryAddress,
                abi: dukigenRegistryAbi,
                functionName: 'eventState',
            })

            if (Number(chainEvtSeq) === 0 || Number(chainEvtSeq) <= Number(req.lastEvtSeq)) {
                return create(SyncEventsRespSchema, {
                    syncedUpTo: chainEvtSeq as bigint,
                    eventsIndexed: 0,
                    chainEvtSeq: chainEvtSeq as bigint,
                })
            }

            // Find best fromBlock from checkpoints
            const fromBlock = findBestCheckpoint(checkpoints, Number(req.lastEvtSeq))
            const latestBlock = await client.getBlockNumber()
            const toBlock = fromBlock + maxRange < latestBlock ? fromBlock + maxRange : latestBlock

            // Pull and index events
            const events = await pullDukigenEventsByBlockRange(req.chainEid, fromBlock, toBlock)
            const newEvents = events.filter(e => Number(e.evtSeq) > Number(req.lastEvtSeq))
            await processDukigenEvents(_db, newEvents)

            const syncedUpTo = newEvents.length > 0
                ? BigInt(newEvents[newEvents.length - 1].evtSeq)
                : req.lastEvtSeq

            return create(SyncEventsRespSchema, {
                syncedUpTo,
                eventsIndexed: newEvents.length,
                chainEvtSeq: chainEvtSeq as bigint,
            })
        },
    })
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Find the best (lowest) block number from checkpoints that covers
 * events after lastEvtSeq. Falls back to the earliest non-zero checkpoint.
 */
function findBestCheckpoint(checkpoints: readonly bigint[], lastEvtSeq: number): bigint {
    // The checkpoint at slot i covers events starting at evtSeq = i*64 + 1
    // Find the slot that contains lastEvtSeq
    const targetSlot = lastEvtSeq > 0 ? Math.floor((lastEvtSeq - 1) / 64) % 4 : 0

    // Try the target slot's checkpoint first
    if (checkpoints[targetSlot] > 0n) return checkpoints[targetSlot]

    // Fallback: use the earliest non-zero checkpoint
    let earliest = 0n
    for (const cp of checkpoints) {
        if (cp > 0n && (earliest === 0n || cp < earliest)) earliest = cp
    }
    return earliest > 0n ? earliest : 0n
}
