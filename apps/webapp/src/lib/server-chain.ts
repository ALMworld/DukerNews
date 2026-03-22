/**
 * server-chain.ts — Server-side chain config helpers.
 *
 * Two concepts:
 *   getHomeChain()  — The chain where DukerNews contract is deployed.
 *                     Driven by CHAIN env variable (set in .dev.vars / wrangler env):
 *                       CHAIN=local    → Anvil localhost (default)
 *                       CHAIN=sepolia  → Sepolia testnet
 *                       CHAIN=xlayer   → XLayer mainnet
 *
 *   getPaymentChainConfig(chainId)
 *                  — Resolve config for a payment chain where x402 settles
 *                     stablecoin transfers. The payment chain may differ from the
 *                     home chain (e.g. pay on BNB with USD1, mint on XLayer).
 */

import { ADDRESSES, SUPPORTED_CHAINS, LOCAL_CHAIN_ID, SEPOLIA_CHAIN_ID, XLAYER_CHAIN_ID } from './contracts'
import type { Address } from 'viem'

/**
 * Get the home chain config — where DukerNews contract is deployed.
 * This is always env-driven (one deployment per server instance).
 */
export function getHomeChain() {
    const chainEnv = process.env.CHAIN ?? 'local'

    switch (chainEnv) {
        case 'sepolia':
            return {
                chainId: SEPOLIA_CHAIN_ID,
                addrs: ADDRESSES[SEPOLIA_CHAIN_ID] as { DukerNews: Address; Treasury: Address },
                viemChain: {
                    id: SEPOLIA_CHAIN_ID,
                    name: 'Sepolia',
                    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                    rpcUrls: { default: { http: [process.env.RPC_URL_SEPOLIA ?? 'https://1rpc.io/sepolia'] } },
                } as const,
                rpcUrl: process.env.RPC_URL_SEPOLIA ?? 'https://1rpc.io/sepolia',
            }

        case 'xlayer':
            return {
                chainId: XLAYER_CHAIN_ID,
                addrs: ADDRESSES[XLAYER_CHAIN_ID],
                viemChain: {
                    id: XLAYER_CHAIN_ID,
                    name: 'XLayer',
                    nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
                    rpcUrls: { default: { http: [process.env.RPC_URL_XLAYER ?? 'https://rpc.xlayer.tech'] } },
                } as const,
                rpcUrl: process.env.RPC_URL_XLAYER ?? 'https://rpc.xlayer.tech',
            }

        default: // 'local'
            return {
                chainId: LOCAL_CHAIN_ID,
                addrs: ADDRESSES[LOCAL_CHAIN_ID],
                viemChain: {
                    id: LOCAL_CHAIN_ID,
                    name: 'Anvil',
                    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                    rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
                } as const,
                rpcUrl: 'http://127.0.0.1:8545',
            }
    }
}

/**
 * Get payment chain config by chain ID.
 * Used to resolve which stablecoins are available on the chain
 * where x402 settles the payment.
 *
 * In the future this will also provide RPC URLs for verifying
 * x402 settlement on the payment chain before calling the home chain contract.
 */
export function getPaymentChainConfig(chainId: number) {
    const chain = SUPPORTED_CHAINS.find(c => c.id === chainId)
    if (!chain) return null
    return chain
}

/** @deprecated Use getHomeChain() instead */
export const getServerChain = getHomeChain
