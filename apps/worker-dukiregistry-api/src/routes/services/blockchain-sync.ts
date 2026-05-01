import { type ConnectRouter } from '@connectrpc/connect';
import { create } from '@bufbuild/protobuf';
import { createPublicClient, http } from 'viem';
import { getChainConfig } from '../../config';
import { dukerRegistryAbi } from 'contract-duki-alm-world';
import {
    BlockchainSyncService,
    ContractType,
    NotifyTxRespSchema,
    BlockchainSyncRespSchema,
} from '@repo/dukiregistry-apidefs';
import { _db, syncDukigenContract, syncMinterContract, findBestCheckpoint, getContinuousDukerEvtSeq, chunkedSync } from '../shared';


import { pullTxReceipt, pullDukerEventsByBlockRange } from '../../services/chain-puller';
import { processDukerEvents } from '../../services/duker-event-service';
import { processDukigenEvents } from '../../services/dukigen-event-service';
import {
    pullMinterEventsFromTx,
    processMinterEvents,
} from '../../services/minter-event-service';

export function registerBlockchainSyncService(router: ConnectRouter) {
    // ── BlockchainSyncService (unified ingest) ──────────────────
    //
    // Consolidates all notify/sync RPCs for DukerRegistry, DukigenRegistry,
    // and AlmWorldMinter into a single service with a ContractType switch.

    router.service(BlockchainSyncService, {
        async notifyTx(req) {
            const resp = create(NotifyTxRespSchema, {})

            switch (req.contract) {
                case ContractType.DUKER_REGISTRY: {
                    const pulled = await pullTxReceipt(req.chainEid, req.txHash)
                    await processDukerEvents(_db, pulled.dukerEvents)
                    resp.dukerEvents = pulled.dukerEvents
                    break
                }
                case ContractType.DUKIGEN_REGISTRY: {
                    const pulled = await pullTxReceipt(req.chainEid, req.txHash)
                    await processDukigenEvents(_db, pulled.dukigenEvents)
                    resp.dukigenEvents = pulled.dukigenEvents
                    break
                }
                case ContractType.ALM_WORLD_MINTER: {
                    const events = await pullMinterEventsFromTx(req.chainEid, req.txHash)
                    await processMinterEvents(_db, events)
                    resp.minterEvents = events
                    break
                }
                default:
                    throw new Error(`Unknown contract type: ${req.contract}`)
            }

            return resp
        },

        async syncEvents(req) {
            switch (req.contract) {
                case ContractType.DUKER_REGISTRY:
                    return await syncDukerContract(req.chainEid)

                case ContractType.DUKIGEN_REGISTRY:
                    return await syncDukigenContract(req.chainEid)

                case ContractType.ALM_WORLD_MINTER:
                    return await syncMinterContract(req.chainEid)

                default:
                    throw new Error(`Unknown contract type: ${req.contract}`)
            }
        },
    })
}

// ── Sync implementations (one per contract) ─────────────────────────────

async function syncDukerContract(chainEid: number) {
    const lastEvtSeq = await getContinuousDukerEvtSeq(chainEid)
    const cfg = getChainConfig(chainEid)
    const client = createPublicClient({ transport: http(cfg.rpcUrl) })

    const [chainEvtSeq, checkpoints] = await client.readContract({
        address: cfg.dukerRegistryAddress,
        abi: dukerRegistryAbi,
        functionName: 'eventState',
    })

    if (Number(chainEvtSeq) === 0 || Number(chainEvtSeq) <= Number(lastEvtSeq)) {
        return create(BlockchainSyncRespSchema, {
            lastEvtSeq,
            eventsIndexed: 0,
            lastBlockNumber: 0n,
        })
    }

    const fromBlockStart = findBestCheckpoint(checkpoints, Number(lastEvtSeq))
    const latestBlock = await client.getBlockNumber()

    const result = await chunkedSync({
        fromBlock: fromBlockStart,
        latestBlock,
        lastEvtSeq,
        chainEvtSeq: chainEvtSeq as bigint,
        maxBlockRange: 0n,
        pull: (from, to) => pullDukerEventsByBlockRange(chainEid, from, to),
        process: (evts) => processDukerEvents(_db, evts),
        getEvtSeq: (e) => e.evtSeq,
    })

    return create(BlockchainSyncRespSchema, {
        lastEvtSeq: result.syncedUpTo,
        eventsIndexed: result.eventsIndexed,
        lastBlockNumber: latestBlock,
    })

}
