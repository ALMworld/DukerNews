/**
 * minter-event-service.ts — Index AlmWorldDukiMinter `DealDukiMinted` events.
 *
 * Two ingest paths share the same INSERT (idempotent on `(chain_eid, evt_seq)`):
 *   1. BlockchainSyncService.NotifyTx — webhook after a successful mint tx.
 *   2. BlockchainSyncService.SyncEvents — eth_getLogs over a block range.
 *
 * Both paths return proto-typed `DealDukiMintedEvent` objects directly.
 * The d6 amount fields on the proto (dukiD6Amount, almYangD6Amount, almYinD6Amount)
 * are computed here once (d18 / 1e12) and stored as INTEGER in D1 for fast queries.
 */

import { create } from '@bufbuild/protobuf'
import { DealDukiMintedEventSchema, type DealDukiMintedEvent } from '@repo/dukiregistry-apidefs'
import { createPublicClient, http, decodeEventLog, type Log } from 'viem'
import { getChainConfig, DEAL_DUKI_MINTED_ABI } from '../config'

// 1e12 — converts d18 → d6 (drops last 12 decimal places)
const D18_TO_D6 = 1_000_000_000_000n

// Re-export for callers that need the type (e.g. grpc.ts)
export type { DealDukiMintedEvent }

/** Pull DealDukiMinted logs from a single tx receipt. */
export async function pullMinterEventsFromTx(
    chainEid: number,
    txHash: string,
): Promise<DealDukiMintedEvent[]> {
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
    const events: DealDukiMintedEvent[] = []

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
): Promise<DealDukiMintedEvent[]> {
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

    const events: DealDukiMintedEvent[] = []
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
): DealDukiMintedEvent | null {
    try {
        const decoded = decodeEventLog({
            abi: DEAL_DUKI_MINTED_ABI,
            data: log.data,
            topics: log.topics as any,
        })
        const args = decoded.args as any
        const dukiAmount    = args.dukiAmount    as bigint
        const almYangAmount = args.almYangAmount  as bigint
        const almYinAmount  = args.almYinAmount   as bigint

        return create(DealDukiMintedEventSchema, {
            chainEid,
            evtSeq:           args.sequence as bigint,
            txHash,
            blockNumber,
            evtTime,
            yangReceiver:     (args.yangReceiver as string).toLowerCase(),
            yinReceiver:      (args.yinReceiver  as string).toLowerCase(),
            stablecoin:       (args.stablecoin   as string).toLowerCase(),
            dukiAmount:       dukiAmount.toString(),    // uint256 stays as string
            almYangAmount:    almYangAmount.toString(),
            almYinAmount:     almYinAmount.toString(),
            dukiD6Amount:     dukiAmount    / D18_TO_D6,
            almYangD6Amount:  almYangAmount / D18_TO_D6,
            almYinD6Amount:   almYinAmount  / D18_TO_D6,
            minter:           (args.minter as string).toLowerCase(),
            agentId:          args.agentId as bigint,
        })
    } catch {
        return null
    }
}

/** Persist a proto event row. Idempotent on (chain_eid, evt_seq). */
export async function persistMinterEvent(
    db: D1Database,
    evt: DealDukiMintedEvent,
): Promise<void> {
    await db.prepare(`
        INSERT OR IGNORE INTO deal_duki_minted_events
        (chain_eid, evt_seq, tx_hash, block_number, evt_time,
         yang_receiver, yin_receiver, stablecoin,
         duki_amount, alm_yang_amount, alm_yin_amount,
         duki_d6_amount, alm_yang_d6_amount, alm_yin_d6_amount,
         minter, agent_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        evt.chainEid,
        Number(evt.evtSeq),         // evt_seq INTEGER
        evt.txHash,
        Number(evt.blockNumber),
        Number(evt.evtTime),
        evt.yangReceiver,
        evt.yinReceiver,
        evt.stablecoin,
        evt.dukiAmount,              // already string (uint256)
        evt.almYangAmount,
        evt.almYinAmount,
        Number(evt.dukiD6Amount),    // d6 INTEGER
        Number(evt.almYangD6Amount),
        Number(evt.almYinD6Amount),
        evt.minter,
        String(evt.agentId),         // agent_id TEXT
    ).run()
}

/** Persist many events in order. */
export async function processMinterEvents(
    db: D1Database,
    events: DealDukiMintedEvent[],
): Promise<void> {
    for (const evt of events) await persistMinterEvent(db, evt)
}

// ── Sync state (last block per chain) ──────────────────────────────────────

export async function getLastBlockNumber(
    db: D1Database,
    chainEid: number,
    contractAddress: string
): Promise<bigint> {
    const row = await db.prepare(`
        SELECT last_block_number FROM sync_state 
        WHERE chain_eid = ? AND contract_address = ? COLLATE NOCASE
    `).bind(chainEid, contractAddress).first<{ last_block_number: number }>()
    return BigInt(row?.last_block_number ?? 0)
}

export async function setLastBlockNumber(
    db: D1Database,
    chainEid: number,
    contractAddress: string,
    block: bigint,
    lastEvtSeq: bigint,
): Promise<void> {
    const now = Math.floor(Date.now() / 1000)
    await db.prepare(`
        INSERT INTO sync_state (chain_eid, contract_address, last_block_number, last_evt_seq, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(chain_eid, contract_address) DO UPDATE SET 
            last_block_number = excluded.last_block_number, 
            last_evt_seq = excluded.last_evt_seq,
            updated_at = excluded.updated_at
    `).bind(
        chainEid,
        contractAddress,
        Number(block),
        Number(lastEvtSeq),
        now
    ).run()
}
