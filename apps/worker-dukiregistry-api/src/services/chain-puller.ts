/**
 * chain-puller.ts — Fetch tx receipts from chain and extract registry events.
 */

import { createPublicClient, http, type Log } from 'viem'
import { getChainConfig, DUKER_EVENT_ABI, DUKIGEN_EVENT_ABI } from '../config'

export interface PulledDukerEvent {
    chainEid: number
    evtSeq: bigint
    tokenId: bigint
    eventType: number
    ego: string
    username: string
    evtTime: bigint
    eventData: string // hex
    txHash: string
    blockNumber: bigint
}

export interface PulledDukigenEvent {
    chainEid: number
    evtSeq: bigint
    agentId: bigint
    eventType: number
    ego: string
    evtTime: bigint
    eventData: string // hex
    txHash: string
    blockNumber: bigint
}

export interface PulledReceipt {
    dukerEvents: PulledDukerEvent[]
    dukigenEvents: PulledDukigenEvent[]
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

    const dukerEvents: PulledDukerEvent[] = []
    const dukigenEvents: PulledDukigenEvent[] = []

    for (const log of receipt.logs) {
        // Try parse as DukerEvent
        try {
            const addr = log.address.toLowerCase()
            if (addr === cfg.dukerRegistryAddress.toLowerCase()) {
                const parsed = parseDukerLog(log, chainEid, txHash, receipt.blockNumber)
                if (parsed) dukerEvents.push(parsed)
            }
            if (addr === cfg.dukigenRegistryAddress.toLowerCase()) {
                const parsed = parseDukigenLog(log, chainEid, txHash, receipt.blockNumber)
                if (parsed) dukigenEvents.push(parsed)
            }
        } catch {
            // Not a matching event — skip
        }
    }

    return { dukerEvents, dukigenEvents }
}

function parseDukerLog(log: Log, chainEid: number, txHash: string, blockNumber: bigint): PulledDukerEvent | null {
    // DukerEvent: topics[0]=sig, topics[1]=tokenId, topics[2]=evtSeq
    // Data: eventType, ego, username, evtTime, eventData
    if (!log.topics[0] || !log.topics[1] || !log.topics[2]) return null

    // Check event signature matches
    const expectedSig = '0x' // Will be computed from ABI
    // Use viem's decodeEventLog for proper parsing
    const { decodeEventLog } = require('viem') as typeof import('viem')
    try {
        const decoded = decodeEventLog({
            abi: DUKER_EVENT_ABI,
            data: log.data,
            topics: log.topics as any,
        })
        const args = decoded.args as any
        return {
            chainEid,
            evtSeq: args.evtSeq,
            tokenId: args.tokenId,
            eventType: Number(args.eventType),
            ego: args.ego.toLowerCase(),
            username: args.username,
            evtTime: args.evtTime,
            eventData: log.data,
            txHash,
            blockNumber,
        }
    } catch {
        return null
    }
}

function parseDukigenLog(log: Log, chainEid: number, txHash: string, blockNumber: bigint): PulledDukigenEvent | null {
    const { decodeEventLog } = require('viem') as typeof import('viem')
    try {
        const decoded = decodeEventLog({
            abi: DUKIGEN_EVENT_ABI,
            data: log.data,
            topics: log.topics as any,
        })
        const args = decoded.args as any
        return {
            chainEid,
            evtSeq: args.evtSeq,
            agentId: args.agentId,
            eventType: Number(args.eventType),
            ego: args.ego.toLowerCase(),
            evtTime: args.evtTime,
            eventData: log.data,
            txHash,
            blockNumber,
        }
    } catch {
        return null
    }
}
