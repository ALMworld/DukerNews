/**
 * minter-event-service.ts — Index AlmWorldDukiMinter `DealDukiMinted` events.
 *
 * Two ingest paths share the same INSERT (idempotent on `(chain_eid, sequence)`):
 *   1. BlockchainSyncService.NotifyTx — webhook after a successful mint tx.
 *   2. BlockchainSyncService.SyncEvents — eth_getLogs over a block range.
 *
 * Both paths produce `PulledDealDukiMintedEvent`s, which are the worker-internal
 * shape (bigint amounts) before being written to D1 as text.
 */

import { createPublicClient, http, decodeEventLog, type Log } from 'viem'
import { getChainConfig, DEAL_DUKI_MINTED_ABI } from '../config'

export interface PulledDealDukiMintedEvent {
    chainEid: number
    sequence: bigint        // contract's monotonic counter (uint256)
    txHash: string
    blockNumber: bigint
    evtTime: bigint         // block timestamp (unix seconds)

    yangReceiver: string
    yinReceiver: string
    stablecoin: string
    dukiAmount: bigint
    almYangAmount: bigint
    almYinAmount: bigint
    minter: string
    agentId: bigint
}

/** Pull DealDukiMinted logs from a single tx receipt. */
export async function pullMinterEventsFromTx(
    chainEid: number,
    txHash: string,
): Promise<PulledDealDukiMintedEvent[]> {
    const cfg = getChainConfig(chainEid)
    if (!cfg.almWorldDukiMinterAddress || cfg.almWorldDukiMinterAddress === '0x0000000000000000000000000000000000000000') {
        return []
    }

    const client = createPublicClient({ transport: http(cfg.rpcUrl) })
    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` })

    // Block timestamp — pulled once per tx; events from the same tx share it.
    const block = await client.getBlock({ blockNumber: receipt.blockNumber })
    const evtTime = block.timestamp

    const minterAddr = cfg.almWorldDukiMinterAddress.toLowerCase()
    const events: PulledDealDukiMintedEvent[] = []

    for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== minterAddr) continue
        const parsed = parseDealDukiMintedLog(log, chainEid, txHash, receipt.blockNumber, evtTime)
        if (parsed) events.push(parsed)
    }
    return events
}

/** Pull DealDukiMinted logs over a block range using eth_getLogs. */
export async function pullDealDukiMintedByBlockRange(
    chainEid: number,
    fromBlock: bigint,
    toBlock: bigint,
): Promise<PulledDealDukiMintedEvent[]> {
    const cfg = getChainConfig(chainEid)
    if (!cfg.almWorldDukiMinterAddress || cfg.almWorldDukiMinterAddress === '0x0000000000000000000000000000000000000000') {
        return []
    }

    const client = createPublicClient({ transport: http(cfg.rpcUrl) })
    const logs = await client.getLogs({
        address: cfg.almWorldDukiMinterAddress,
        events: DEAL_DUKI_MINTED_ABI,
        fromBlock,
        toBlock,
    })

    // Group logs by block to fetch each block's timestamp at most once.
    const blocksToFetch = new Set<bigint>()
    for (const log of logs) if (log.blockNumber != null) blocksToFetch.add(log.blockNumber)
    const timestamps = new Map<bigint, bigint>()
    await Promise.all(Array.from(blocksToFetch).map(async (bn) => {
        const block = await client.getBlock({ blockNumber: bn })
        timestamps.set(bn, block.timestamp)
    }))

    const events: PulledDealDukiMintedEvent[] = []
    for (const log of logs) {
        const blockNumber = log.blockNumber ?? 0n
        const evtTime = timestamps.get(blockNumber) ?? 0n
        const parsed = parseDealDukiMintedLog(
            log as any,
            chainEid,
            log.transactionHash ?? '',
            blockNumber,
            evtTime,
        )
        if (parsed) events.push(parsed)
    }
    return events
}

function parseDealDukiMintedLog(
    log: Log,
    chainEid: number,
    txHash: string,
    blockNumber: bigint,
    evtTime: bigint,
): PulledDealDukiMintedEvent | null {
    try {
        const decoded = decodeEventLog({
            abi: DEAL_DUKI_MINTED_ABI,
            data: log.data,
            topics: log.topics as any,
        })
        const args = decoded.args as any
        return {
            chainEid,
            sequence: args.sequence as bigint,
            txHash,
            blockNumber,
            evtTime,
            yangReceiver: (args.yangReceiver as string).toLowerCase(),
            yinReceiver: (args.yinReceiver as string).toLowerCase(),
            stablecoin: (args.stablecoin as string).toLowerCase(),
            dukiAmount: args.dukiAmount as bigint,
            almYangAmount: args.almYangAmount as bigint,
            almYinAmount: args.almYinAmount as bigint,
            minter: (args.minter as string).toLowerCase(),
            agentId: args.agentId as bigint,
        }
    } catch {
        return null
    }
}

/** Persist a pulled event row. Idempotent on (chain_eid, sequence). */
export async function persistMinterEvent(
    db: D1Database,
    evt: PulledDealDukiMintedEvent,
): Promise<void> {
    await db.prepare(`
        INSERT OR IGNORE INTO deal_duki_minted_events
        (chain_eid, sequence, tx_hash, block_number, evt_time,
         yang_receiver, yin_receiver, stablecoin,
         duki_amount, alm_yang_amount, alm_yin_amount,
         minter, agent_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        evt.chainEid,
        evt.sequence.toString(),
        evt.txHash,
        Number(evt.blockNumber),
        Number(evtTime(evt.evtTime)),
        evt.yangReceiver,
        evt.yinReceiver,
        evt.stablecoin,
        evt.dukiAmount.toString(),
        evt.almYangAmount.toString(),
        evt.almYinAmount.toString(),
        evt.minter,
        evt.agentId.toString(),
    ).run()
}

// SQLite INTEGER fits 53 bits cleanly; block timestamps live there comfortably
// for centuries. Keep the conversion explicit so a stray `bigint` doesn't sneak
// through into D1's binder.
function evtTime(t: bigint): number {
    return Number(t)
}

/** Persist many events in order. */
export async function processMinterEvents(
    db: D1Database,
    events: PulledDealDukiMintedEvent[],
): Promise<void> {
    for (const evt of events) await persistMinterEvent(db, evt)
}

// ── Sync state (last block per chain) ──

export async function getLastBlockIndexed(db: D1Database, chainEid: number): Promise<bigint> {
    const row = await db.prepare(
        'SELECT last_block_indexed FROM minter_sync_state WHERE chain_eid = ?'
    ).bind(chainEid).first<{ last_block_indexed: number }>()
    return BigInt(row?.last_block_indexed ?? 0)
}

export async function setLastBlockIndexed(
    db: D1Database,
    chainEid: number,
    block: bigint,
): Promise<void> {
    const now = Math.floor(Date.now() / 1000)
    await db.prepare(`
        INSERT INTO minter_sync_state (chain_eid, last_block_indexed, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(chain_eid) DO UPDATE SET last_block_indexed = excluded.last_block_indexed, updated_at = excluded.updated_at
    `).bind(chainEid, Number(block), now).run()
}
