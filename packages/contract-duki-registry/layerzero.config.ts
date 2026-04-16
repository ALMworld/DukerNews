import { EndpointId } from '@layerzerolabs/lz-definitions'
import { ExecutorOptionType } from '@layerzerolabs/lz-v2-utilities'
import { TwoWayConfig, generateConnectionsConfig } from '@layerzerolabs/metadata-tools'
import { OAppEnforcedOption } from '@layerzerolabs/toolbox-hardhat'

import type { OmniPointHardhat } from '@layerzerolabs/toolbox-hardhat'

// ═══════════════════════════════════════════════════════════════
//  DukerRegistry contract definitions per chain (testnet)
// ═══════════════════════════════════════════════════════════════

const bscTestnet: OmniPointHardhat = {
    eid: EndpointId.BSC_V2_TESTNET,
    contractName: 'DukerRegistry',
}

const xlayerTestnet: OmniPointHardhat = {
    eid: EndpointId.XLAYER_V2_TESTNET,
    contractName: 'DukerRegistry',
}

const baseSepolia: OmniPointHardhat = {
    eid: EndpointId.BASESEP_V2_TESTNET,
    contractName: 'DukerRegistry',
}

const arbSepolia: OmniPointHardhat = {
    eid: EndpointId.ARBSEP_V2_TESTNET,
    contractName: 'DukerRegistry',
}

// ═══════════════════════════════════════════════════════════════
//  Enforced options
// ═══════════════════════════════════════════════════════════════

// DukerRegistry migration requires more gas than a simple ONFT transfer
// because we store identity data on _credit
const EVM_ENFORCED_OPTIONS: OAppEnforcedOption[] = [
    {
        msgType: 1, // SEND
        optionType: ExecutorOptionType.LZ_RECEIVE,
        gas: 200_000, // Higher gas for identity write on destination
        value: 0,
    },
]

// ═══════════════════════════════════════════════════════════════
//  Pathways — fully meshed testnet topology
// ═══════════════════════════════════════════════════════════════

const pathways: TwoWayConfig[] = [
    // BSC-testnet ↔ X Layer-testnet
    [bscTestnet, xlayerTestnet, [['LayerZero Labs'], []], [1, 1], [EVM_ENFORCED_OPTIONS, EVM_ENFORCED_OPTIONS]],
    // BSC-testnet ↔ Base-sepolia
    [bscTestnet, baseSepolia, [['LayerZero Labs'], []], [1, 1], [EVM_ENFORCED_OPTIONS, EVM_ENFORCED_OPTIONS]],
    // BSC-testnet ↔ Arb-sepolia
    [bscTestnet, arbSepolia, [['LayerZero Labs'], []], [1, 1], [EVM_ENFORCED_OPTIONS, EVM_ENFORCED_OPTIONS]],
    // X Layer-testnet ↔ Base-sepolia
    [xlayerTestnet, baseSepolia, [['LayerZero Labs'], []], [1, 1], [EVM_ENFORCED_OPTIONS, EVM_ENFORCED_OPTIONS]],
    // X Layer-testnet ↔ Arb-sepolia
    [xlayerTestnet, arbSepolia, [['LayerZero Labs'], []], [1, 1], [EVM_ENFORCED_OPTIONS, EVM_ENFORCED_OPTIONS]],
    // Base-sepolia ↔ Arb-sepolia
    [baseSepolia, arbSepolia, [['LayerZero Labs'], []], [1, 1], [EVM_ENFORCED_OPTIONS, EVM_ENFORCED_OPTIONS]],
]

export default async function () {
    const connections = await generateConnectionsConfig(pathways)
    return {
        contracts: [
            { contract: bscTestnet },
            { contract: xlayerTestnet },
            { contract: baseSepolia },
            { contract: arbSepolia },
        ],
        connections,
    }
}
