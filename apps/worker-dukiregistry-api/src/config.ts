/**
 * config.ts — Multi-chain configuration for DukerRegistry + DukigenRegistry indexer.
 *
 * Addresses come from the canonical deployment module in contract_duki_alm_world.
 * RPC URLs come from environment variables (.dev.vars).
 */

import { almDeployments, type AlmDeployment } from 'contract-duki-alm-world/deployments'
import { dukerRegistryAbi, dukigenRegistryAbi } from 'contract-duki-alm-world'

// ── Chain config ──────────────────────────────────────────────

export interface ChainConfig {
    rpcUrl: string
    dukerRegistryAddress: `0x${string}`
    dukigenRegistryAddress: `0x${string}`
}

/**
 * Build ChainConfig from the canonical almDeployments.
 * RPC URL defaults to the deployment's rpcUrl (if set), otherwise empty.
 */
function buildChainConfigs(): Record<number, ChainConfig> {
    const configs: Record<number, ChainConfig> = {}
    for (const [eidStr, d] of Object.entries(almDeployments) as [string, AlmDeployment][]) {
        const eid = Number(eidStr)
        configs[eid] = {
            rpcUrl: d.rpcUrl ?? '',
            dukerRegistryAddress: d.dukerRegistry,
            dukigenRegistryAddress: d.dukigenRegistry,
        }
    }
    return configs
}

const CHAIN_CONFIGS = buildChainConfigs()

export function getChainConfig(chainEid: number): ChainConfig {
    const cfg = CHAIN_CONFIGS[chainEid]
    if (!cfg) throw new Error(`Unsupported chain EID: ${chainEid}`)
    return cfg
}

export function getSupportedChainEids(): number[] {
    return Object.keys(CHAIN_CONFIGS).map(Number)
}

// ── ABI fragments for log parsing (derived from generated contract ABIs) ──

export const DUKER_EVENT_ABI = dukerRegistryAbi.filter(
    (item) => item.type === 'event' && item.name === 'DukerEvent'
)

export const DUKIGEN_EVENT_ABI = dukigenRegistryAbi.filter(
    (item) => item.type === 'event' && item.name === 'DukigenEvent'
)