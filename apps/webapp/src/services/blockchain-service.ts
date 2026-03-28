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
import { getHomeChain } from '../lib/server-chain'
import {
    EventType,
    AggType,
    PbEventSchema,
    EventDataSchema,
    type PbEvent,
} from '@repo/apidefs'

function getPublicClient() {
    const { viemChain, rpcUrl } = getHomeChain()
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
 *   - USER_MINTED: ABI-encoded by contract → decodeAbiParameters
 *   - Others: protobuf-serialized by frontend → fromBinary
 */
function convertLogToEvent(args: DukerEventArgs, blockNumber?: bigint): PbEvent {
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
                data = {
                    payload: {
                        case: 'userMinted' as const,
                        value: {
                            address: args.ego,
                            username: d.username,
                            txHash: '',
                            mintAmount: BigInt(d.amount),
                            dukiBps: Number(d.dukiBps),
                            tokenId: BigInt(d.tokenId),
                        },
                    },
                } as any
                break
            }

            default: {
                // Frontend-originated events: eventData is protobuf-serialized EventData
                try {
                    const bytes = hexToBytes(args.eventData)
                    const eventData = fromBinary(EventDataSchema, bytes)
                    data = eventData as PbEvent['data']
                } catch (e) {
                    console.warn(
                        `[blockchain-service] Failed to decode protobuf eventData for evtType=${evtType}:`,
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

    return dukerLogs.map(log => convertLogToEvent(log.args, log.blockNumber))
}

/**
 * Pull ALL DukerEvent logs from the contract, starting from a given block.
 * Returns parsed PbEvent[] + the latest block number for cursor tracking.
 *
 * Automatically chunks requests into 9500-block windows to stay within
 * provider limits (e.g. 1rpc.io caps eth_getLogs at 10000 blocks).
 */
export async function getAllEvents(fromBlock: bigint = 0n): Promise<{
    events: PbEvent[]
    latestBlock: bigint
}> {
    const publicClient = getPublicClient()
    const { addrs } = getHomeChain()

    const latestBlock = await publicClient.getBlockNumber()

    // Guard: nothing to fetch if fromBlock is already at or past the tip
    if (fromBlock > latestBlock) {
        return { events: [], latestBlock }
    }

    const eventDef = {
        type: 'event' as const,
        name: 'DukerEvent',
        inputs: (dukerNewsAbi.find(
            e => e.type === 'event' && e.name === 'DukerEvent'
        ) as any).inputs,
    }

    // Chunk into 9500-block windows to stay within provider limits
    const CHUNK = 9500n
    const allLogs: any[] = []
    let chunkFrom = fromBlock

    while (chunkFrom <= latestBlock) {
        const chunkTo = chunkFrom + CHUNK - 1n > latestBlock
            ? latestBlock
            : chunkFrom + CHUNK - 1n

        const chunkLogs = await publicClient.getLogs({
            address: addrs.DukerNews,
            event: eventDef,
            fromBlock: chunkFrom,
            toBlock: chunkTo,
        })
        allLogs.push(...chunkLogs)
        chunkFrom = chunkTo + 1n
    }

    // Parse the raw logs through the ABI to get typed args
    const dukerLogs = parseEventLogs({
        abi: dukerNewsAbi,
        logs: allLogs,
        eventName: 'DukerEvent',
    })

    const events = dukerLogs.map(log => convertLogToEvent(log.args, log.blockNumber))

    return { events, latestBlock }
}
