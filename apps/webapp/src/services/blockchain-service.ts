/**
 * blockchain-service.ts — Pull DukerEvent logs from chain + convert to PbEvent.
 *
 * Two responsibilities:
 *   1. getEventsFromTx(txHash) — wait for receipt, parse DukerEvent logs
 *   2. convertLogToEvent()     — convert raw on-chain log to proto PbEvent
 *
 * Event data decoding:
 *   - USER_MINTED: eventData is ABI-encoded UsernameMintedData (contract-originated)
 *   - POST_CREATED etc: eventData is protobuf-serialized EventData (frontend passthrough)
 */

import { createPublicClient, http, parseEventLogs, decodeAbiParameters, hexToBytes, type GetEventArgs } from 'viem'
import { create, fromBinary } from '@bufbuild/protobuf'
import { dukerNewsAbi } from '../lib/contracts'
import { getDukerChain } from '../lib/duker-chain'
import {
    EventType,
    AggType,
    PbEventSchema,
    EventDataSchema,
    UserMintedPayloadSchema,
    type PbEvent,
    inflateRaw,
} from '@repo/dukernews-apidefs'

function getPublicClient() {
    const { viemChain, rpcUrl } = getDukerChain()
    return createPublicClient({ chain: viemChain as any, transport: http(rpcUrl) })
}

// ─── ABI for decoding USER_MINTED eventData ──────────────
// Extracted from the wagmi-generated dukerNewsAbi (_ABI_UsernameMintedData error).
// The contract ABI-encodes a UsernameMintedData struct for this event type.

const USER_MINTED_DATA_ABI = (() => {
    const abiEntry = dukerNewsAbi.find(
        e => e.type === 'error' && e.name === '_ABI_UsernameMintedData'
    )
    if (!abiEntry || abiEntry.type !== 'error') {
        throw new Error('_ABI_UsernameMintedData not found in dukerNewsAbi')
    }
    return abiEntry.inputs
})()

// ─── Event type mapping ──────────────────────────────────

/** Map on-chain uint32 eventType to proto EventType */
function toEventType(raw: number): EventType {
    // proto EventType values match on-chain values exactly
    return raw as EventType
}

/** Map on-chain uint8 aggType to proto AggType */
function toAggType(raw: number): AggType {
    return raw as AggType
}

// ─── Convert: on-chain log → PbEvent ─────────────────────

/** Viem-inferred args type for DukerEvent from the generated ABI (all params, required) */
type DukerEventArgs = GetEventArgs<
    typeof dukerNewsAbi,
    'DukerEvent',
    { EnableUnion: false; IndexedOnly: false; Required: true }
>

/**
 * Convert a parsed DukerEvent log to a proto PbEvent.
 * Decodes eventData differently based on event source:
 *   - USER_MINTED: ABI-encoded by contract → decodeAbiParameters → create()
 *   - Others: deflate-raw compressed protobuf → inflateRaw → fromBinary
 */
async function convertLogToEvent(args: DukerEventArgs, blockNumber?: bigint, txHash?: string): Promise<PbEvent> {
    const evtType = toEventType(Number(args.eventType))

    // Build proto EventData payload by decoding eventData bytes
    let data: PbEvent['data']

    if (args.eventData && args.eventData !== '0x') {
        switch (evtType) {
            case EventType.USER_MINTED: {
                // Contract ABI-encodes UsernameMintedData struct
                const decoded = decodeAbiParameters(USER_MINTED_DATA_ABI, args.eventData)
                const d = decoded[0] as {
                    tokenId: bigint
                    username: string
                    amount: bigint
                    dukiBps: number
                }
                // Build with create() so toBinary works later for DB storage
                const eventData = create(EventDataSchema, {
                    payload: {
                        case: 'userMinted' as const,
                        value: create(UserMintedPayloadSchema, {
                            address: args.ego,
                            username: d.username,
                            mintAmount: BigInt(d.amount),
                            dukiBps: Number(d.dukiBps),
                            tokenId: BigInt(d.tokenId),
                        }),
                    },
                })
                data = eventData as PbEvent['data']
                break
            }

            default: {
                try {
                    const bytes = hexToBytes(args.eventData)
                    let decoded: Uint8Array
                    try {
                        decoded = await inflateRaw(bytes)
                    } catch {
                        decoded = bytes
                    }
                    const eventData = fromBinary(EventDataSchema, decoded)
                    data = eventData as PbEvent['data']
                } catch (e) {
                    console.warn(
                        `[blockchain-service] Failed to decode data for evtType=${evtType}:`,
                        e
                    )
                }
                break
            }
        }
    }

    return create(PbEventSchema, {
        evtSeq: args.evtSeq,
        address: args.ego,
        txHash: txHash ?? '',
        username: args.username,
        userSeq: args.userSeq,
        aggType: toAggType(Number(args.aggType)),
        aggId: args.aggId,
        evtType,
        evtTime: args.evtTime,
        data,
        createdAt: BigInt(Date.now()),
        blockNumber: blockNumber ?? 0n,
    }) as PbEvent
}

// ─── Public API ──────────────────────────────────────────

/**
 * Pull DukerEvent logs from a transaction receipt and convert to PbEvent[].
 * Waits for the tx to be confirmed if not yet mined.
 */
export async function getEventsFromTx(txHash: string): Promise<PbEvent[]> {
    const publicClient = getPublicClient()

    const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
    })

    if (receipt.status === 'reverted') {
        throw new Error('Transaction reverted')
    }

    // Parse DukerEvent logs — viem decodes all top-level event params
    const dukerLogs = parseEventLogs({
        abi: dukerNewsAbi,
        logs: receipt.logs,
        eventName: 'DukerEvent',
    })

    return Promise.all(dukerLogs.map(log => convertLogToEvent(log.args, log.blockNumber, txHash)))
}

/**
 * Convert pre-parsed DukerEvent logs (from QuickNode webhook) to PbEvent[].
 * Reuses convertLogToEvent — no RPC calls needed since data comes from webhook.
 */
type DukerEventLog = ReturnType<typeof parseEventLogs<typeof dukerNewsAbi, true, 'DukerEvent'>>[number]

export function getEventsFromWebhookLogs(parsedLogs: DukerEventLog[]): Promise<PbEvent[]> {
    return Promise.all(parsedLogs.map(log => convertLogToEvent(log.args, log.blockNumber, log.transactionHash)))
}


/**
 * Query DukerEvent logs for a specific block range (single RPC call).
 * Used by POST /api/sync-events for precise admin-controlled syncing.
 */
export async function getEventsInRange(fromBlock: bigint, toBlock: bigint): Promise<{
    events: PbEvent[]
    scannedToBlock: bigint
}> {
    const publicClient = getPublicClient()
    const home = getDukerChain()
    const { addrs } = home

    const eventDef = {
        type: 'event' as const,
        name: 'DukerEvent',
        inputs: (dukerNewsAbi.find(
            e => e.type === 'event' && e.name === 'DukerEvent'
        ) as any).inputs,
    }

    const logs = await publicClient.getLogs({
        address: addrs.DukerNews,
        event: eventDef,
        fromBlock,
        toBlock,
    })

    const dukerLogs = parseEventLogs({
        abi: dukerNewsAbi,
        logs,
        eventName: 'DukerEvent',
    })

    const events = await Promise.all(dukerLogs.map(log => convertLogToEvent(log.args, log.blockNumber, log.transactionHash)))

    return { events, scannedToBlock: toBlock }
}
