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
import { decodeEventPayload } from '../services/event-payload'
import { createPublicClient, http } from 'viem'
import { getChainConfig } from '../config'
import { dukerRegistryAbi, dukigenRegistryAbi } from 'contract-duki-alm-world'

// Store reference for context access — set from index.ts
let _db: D1Database

export function setDb(db: D1Database) {
    _db = db
}

// ── ABI decode helpers — raw hex eventData → typed oneof ────────────────

function decodeDukerEventData(evt: PulledDukerEvent): DukerRegistryEvent['eventData'] {
    switch (evt.eventType) {
        case DukerEventType.IDENTITY_BURNED: {
            const d = decodeEventPayload<{ chainEid: number | bigint }>(
                dukerRegistryAbi, 'IdentityBurnedData', evt.eventData,
            )
            if (!d) return { case: undefined, value: undefined }
            return {
                case: 'identityBurned' as const,
                value: create(IdentityBurnedPayloadSchema, {
                    chainEid: Number(d.chainEid),
                }),
            }
        }
        case DukerEventType.PROFILE_UPDATED: {
            const d = decodeEventPayload<{ bio: string; website: string }>(
                dukerRegistryAbi, 'ProfileUpdatedData', evt.eventData,
            )
            if (!d) return { case: undefined, value: undefined }
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
}

function decodeDukigenEventData(evt: PulledDukigenEvent): DukigenRegistryEvent['eventData'] {
    switch (evt.eventType) {
        case DukigenEventType.AGENT_REGISTERED: {
            const d = decodeEventPayload<{
                name: string; agentURI: string; website?: string;
                approxBps?: number | bigint; agentWallet?: string;
                productType?: number | bigint; dukiType?: number | bigint;
                pledgeUrl?: string; tags?: string[];
            }>(dukigenRegistryAbi, 'AgentRegisteredData', evt.eventData)
            if (!d) return { case: undefined, value: undefined }
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
            const d = decodeEventPayload<{ newURI: string }>(
                dukigenRegistryAbi, 'AgentURIUpdatedData', evt.eventData,
            )
            if (!d) return { case: undefined, value: undefined }
            return {
                case: 'agentUriUpdated' as const,
                value: create(AgentURIUpdatedPayloadSchema, { newUri: d.newURI ?? '' }),
            }
        }
        case DukigenEventType.AGENT_APPROX_BPS_SET: {
            const d = decodeEventPayload<{ approxBps: number | bigint }>(
                dukigenRegistryAbi, 'AgentApproxBpsSetData', evt.eventData,
            )
            if (!d) return { case: undefined, value: undefined }
            return {
                case: 'agentApproxBpsSet' as const,
                value: create(AgentApproxBpsSetPayloadSchema, {
                    approxBps: Number(d.approxBps ?? 0),
                }),
            }
        }
        case DukigenEventType.AGENT_WORKS_DATA_SET: {
            const d = decodeEventPayload<{
                productType: number | bigint; dukiType: number | bigint;
                pledgeUrl: string; tags: string[]; website: string;
            }>(dukigenRegistryAbi, 'AgentWorksDataSetData', evt.eventData)
            if (!d) return { case: undefined, value: undefined }
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
            const d = decodeEventPayload<{ key: string; value: string }>(
                dukigenRegistryAbi, 'AgentMetadataSetData', evt.eventData,
            )
            if (!d) return { case: undefined, value: undefined }
            return {
                case: 'agentMetadataSet' as const,
                value: create(AgentMetadataSetPayloadSchema, {
                    key: d.key ?? '',
                    value: d.value ? hexToBytes(d.value) : new Uint8Array(),
                }),
            }
        }
        case DukigenEventType.AGENT_WALLET_SET: {
            const d = decodeEventPayload<{ newWallet: string }>(
                dukigenRegistryAbi, 'AgentWalletSetData', evt.eventData,
            )
            if (!d) return { case: undefined, value: undefined }
            return {
                case: 'agentWalletSet' as const,
                value: create(AgentWalletSetPayloadSchema, { newWallet: d.newWallet ?? '' }),
            }
        }
        case DukigenEventType.AGENT_CHAIN_CONTRACT_SET: {
            const d = decodeEventPayload<{ chainEid: number | bigint; contractAddr: string }>(
                dukigenRegistryAbi, 'AgentChainContractSetData', evt.eventData,
            )
            if (!d) return { case: undefined, value: undefined }
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
}

function hexToBytes(hex: string): Uint8Array {
    const stripped = hex.startsWith('0x') ? hex.slice(2) : hex
    const out = new Uint8Array(stripped.length / 2)
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16)
    }
    return out
}



export function registerGrpcRoutes(router: ConnectRouter) {
    // ── DukerRegistryService ────────────────────────────────

    router.service(DukerRegistryService, {
        async getUsername(req) {
            let query = 'SELECT * FROM duker_users WHERE ego = ? COLLATE NOCASE AND status = ?'
            const params: any[] = [req.address, 'active']

            if (req.chainEid > 0) {
                query += ' AND chain_eid = ?'
                params.push(req.chainEid)
            }
            query += ' ORDER BY chain_eid ASC'

            const result = await _db.prepare(query).bind(...params).all<any>()
            return create(GetUsernameRespSchema, {
                identities: (result.results ?? []).map(rowToIdentity),
            })
        },

        async checkUsername(req) {
            const row = await _db.prepare(
                'SELECT * FROM duker_users WHERE username = ? COLLATE NOCASE AND status = ? LIMIT 1'
            ).bind(req.username, 'active').first<any>()

            if (row) {
                return create(CheckUsernameRespSchema, {
                    available: false,
                    owner: rowToIdentity(row),
                })
            }
            return create(CheckUsernameRespSchema, { available: true })
        },

        async getIdentitiesByToken(req) {
            const result = await _db.prepare(
                'SELECT * FROM duker_users WHERE token_id = ? AND status = ? ORDER BY chain_eid ASC'
            ).bind(req.tokenId, 'active').all<any>()

            return create(GetUsernameRespSchema, {
                identities: (result.results ?? []).map(rowToIdentity),
            })
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
            const lastEvtSeq = req.lastEvtSeq > 0n
                ? req.lastEvtSeq
                : await getContinuousDukerEvtSeq(req.chainEid)
            const cfg = getChainConfig(req.chainEid)
            const client = createPublicClient({ transport: http(cfg.rpcUrl) })

            const [chainEvtSeq, checkpoints] = await client.readContract({
                address: cfg.dukerRegistryAddress,
                abi: dukerRegistryAbi,
                functionName: 'eventState',
            })

            if (Number(chainEvtSeq) === 0 || Number(chainEvtSeq) <= Number(lastEvtSeq)) {
                return create(SyncEventsRespSchema, {
                    syncedUpTo: lastEvtSeq,
                    eventsIndexed: 0,
                    chainEvtSeq: chainEvtSeq as bigint,
                })
            }

            const fromBlockStart = findBestCheckpoint(checkpoints, Number(lastEvtSeq))
            const latestBlock = await client.getBlockNumber()

            const result = await chunkedSync({
                fromBlock: fromBlockStart,
                latestBlock,
                lastEvtSeq,
                chainEvtSeq: chainEvtSeq as bigint,
                maxBlockRange: req.maxBlockRange,
                pull: (from, to) => pullDukerEventsByBlockRange(req.chainEid, from, to),
                process: (evts) => processDukerEvents(_db, evts),
                getEvtSeq: (e) => e.evtSeq,
            })

            return create(SyncEventsRespSchema, {
                syncedUpTo: result.syncedUpTo,
                eventsIndexed: result.eventsIndexed,
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
            const lastEvtSeq = req.lastEvtSeq > 0n
                ? req.lastEvtSeq
                : await getContinuousDukigenEvtSeq(req.chainEid)
            const cfg = getChainConfig(req.chainEid)
            const client = createPublicClient({ transport: http(cfg.rpcUrl) })

            const [chainEvtSeq, checkpoints] = await client.readContract({
                address: cfg.dukigenRegistryAddress,
                abi: dukigenRegistryAbi,
                functionName: 'eventState',
            })

            if (Number(chainEvtSeq) === 0 || Number(chainEvtSeq) <= Number(lastEvtSeq)) {
                return create(SyncEventsRespSchema, {
                    syncedUpTo: lastEvtSeq,
                    eventsIndexed: 0,
                    chainEvtSeq: chainEvtSeq as bigint,
                })
            }

            const fromBlockStart = findBestCheckpoint(checkpoints, Number(lastEvtSeq))
            const latestBlock = await client.getBlockNumber()

            const result = await chunkedSync({
                fromBlock: fromBlockStart,
                latestBlock,
                lastEvtSeq,
                chainEvtSeq: chainEvtSeq as bigint,
                maxBlockRange: req.maxBlockRange,
                pull: (from, to) => pullDukigenEventsByBlockRange(req.chainEid, from, to),
                process: (evts) => processDukigenEvents(_db, evts),
                getEvtSeq: (e) => e.evtSeq,
            })

            return create(SyncEventsRespSchema, {
                syncedUpTo: result.syncedUpTo,
                eventsIndexed: result.eventsIndexed,
                chainEvtSeq: chainEvtSeq as bigint,
            })
        },
    })
}

// ── Helpers ──────────────────────────────────────────────────

function rowToIdentity(row: any) {
    return create(DukerIdentitySchema, {
        username: row.username,
        chainEid: row.chain_eid,
        tokenId: row.token_id,
        ego: row.ego,
        bio: row.bio ?? '',
        website: row.website ?? '',
    })
}

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

/**
 * Largest evt_seq N such that all of 1..N are present in the events table for
 * the given chain. If MIN(evt_seq) > 1 the continuous prefix is empty (0).
 * Used so sync resumes from the highest gap-free point, not from a value with
 * holes underneath it.
 */
async function getContinuousDukerEvtSeq(chainEid: number): Promise<bigint> {
    return getContinuousEvtSeq('duker_registry_events', chainEid)
}

async function getContinuousDukigenEvtSeq(chainEid: number): Promise<bigint> {
    return getContinuousEvtSeq('dukigen_registry_events', chainEid)
}

async function getContinuousEvtSeq(table: string, chainEid: number): Promise<bigint> {
    const minRow = await _db.prepare(
        `SELECT COALESCE(MIN(evt_seq), 0) AS m FROM ${table} WHERE chain_eid = ?`
    ).bind(chainEid).first<{ m?: number | string | null }>()
    const min = Number(minRow?.m ?? 0)
    if (min === 0 || min > 1) return 0n

    const gapRow = await _db.prepare(
        `SELECT MIN(e1.evt_seq) AS s
         FROM ${table} e1
         WHERE e1.chain_eid = ?
           AND NOT EXISTS (
             SELECT 1 FROM ${table} e2
             WHERE e2.chain_eid = e1.chain_eid AND e2.evt_seq = e1.evt_seq + 1
           )`
    ).bind(chainEid).first<{ s?: number | string | null }>()
    return BigInt(gapRow?.s ?? 0)
}

interface ChunkedSyncArgs<E> {
    fromBlock: bigint
    latestBlock: bigint
    lastEvtSeq: bigint
    chainEvtSeq: bigint
    maxBlockRange: bigint
    pull: (from: bigint, to: bigint) => Promise<E[]>
    process: (events: E[]) => Promise<void>
    getEvtSeq: (e: E) => bigint
}

interface ChunkedSyncResult {
    syncedUpTo: bigint
    eventsIndexed: number
}

const DEFAULT_MAX_BLOCK_RANGE = 10000n
const MAX_CHUNKS_PER_REQUEST = 20

/**
 * Walk [fromBlock..latestBlock] in chunks of `maxBlockRange`, pulling logs and
 * applying any events whose evtSeq is past `lastEvtSeq`. Stops early once
 * caught up to `chainEvtSeq` or after MAX_CHUNKS_PER_REQUEST iterations — the
 * caller re-invokes to continue. Lets RPCs that cap getLogs at small ranges
 * (e.g. 50 blocks) still make progress under a single Worker request budget.
 */
async function chunkedSync<E>(args: ChunkedSyncArgs<E>): Promise<ChunkedSyncResult> {
    const maxRange = args.maxBlockRange > 0n ? args.maxBlockRange : DEFAULT_MAX_BLOCK_RANGE
    let fromBlock = args.fromBlock
    let currentLastEvtSeq = args.lastEvtSeq
    let totalIndexed = 0

    if (fromBlock === 0n) fromBlock = 1n

    for (let i = 0; i < MAX_CHUNKS_PER_REQUEST; i++) {
        if (fromBlock > args.latestBlock) break
        const tentativeTo = fromBlock + maxRange - 1n
        const toBlock = tentativeTo < args.latestBlock ? tentativeTo : args.latestBlock

        const events = await args.pull(fromBlock, toBlock)
        const newEvents = events
            .filter(e => args.getEvtSeq(e) > currentLastEvtSeq)
            .sort((a, b) => Number(args.getEvtSeq(a) - args.getEvtSeq(b)))

        if (newEvents.length > 0) {
            await args.process(newEvents)
            totalIndexed += newEvents.length
            currentLastEvtSeq = args.getEvtSeq(newEvents[newEvents.length - 1])
        }

        if (currentLastEvtSeq >= args.chainEvtSeq) break
        fromBlock = toBlock + 1n
    }

    return { syncedUpTo: currentLastEvtSeq, eventsIndexed: totalIndexed }
}
