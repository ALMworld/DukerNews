/**
 * config.ts — Multi-chain configuration for DukerRegistry + DukigenRegistry indexer.
 */

import { parseAbi } from 'viem'

// ── Chain config ──────────────────────────────────────────────

export interface ChainConfig {
    rpcUrl: string
    dukerRegistryAddress: `0x${string}`
    dukigenRegistryAddress: `0x${string}`
}

/** Map of LayerZero EID → chain configuration. */
const CHAIN_CONFIGS: Record<number, ChainConfig> = {
    // Anvil / local dev (EID 31337)
    31337: {
        rpcUrl: 'http://127.0.0.1:8545',
        dukerRegistryAddress: '0x0000000000000000000000000000000000000000',
        dukigenRegistryAddress: '0x0000000000000000000000000000000000000000',
    },
    // Amoy testnet (EID 40267)
    40267: {
        rpcUrl: 'https://rpc-amoy.polygon.technology',
        dukerRegistryAddress: '0x0000000000000000000000000000000000000000',
        dukigenRegistryAddress: '0x0000000000000000000000000000000000000000',
    },
}

/**
 * Override chain config at runtime (used by integration tests to inject
 * deployed addresses from anvil without editing source).
 */
export function setChainConfig(chainEid: number, patch: Partial<ChainConfig>): void {
    const existing = CHAIN_CONFIGS[chainEid] ?? { rpcUrl: '', dukerRegistryAddress: '0x0', dukigenRegistryAddress: '0x0' } as ChainConfig
    CHAIN_CONFIGS[chainEid] = { ...existing, ...patch } as ChainConfig
}

export function getChainConfig(chainEid: number): ChainConfig {
    const cfg = CHAIN_CONFIGS[chainEid]
    if (!cfg) throw new Error(`Unsupported chain EID: ${chainEid}`)
    return cfg
}

export function getSupportedChainEids(): number[] {
    return Object.keys(CHAIN_CONFIGS).map(Number)
}

// ── ABI fragments for log parsing ─────────────────────────────

export const DUKER_EVENT_ABI = parseAbi([
    'event DukerEvent(uint256 indexed tokenId, uint64 indexed evtSeq, uint8 eventType, address ego, string username, uint64 evtTime, bytes eventData)',
])

export const DUKIGEN_EVENT_ABI = parseAbi([
    'event DukigenEvent(uint256 indexed agentId, uint64 indexed evtSeq, uint32 eventType, address ego, uint64 evtTime, bytes eventData)',
])