/**
 * duker-chain.ts — DukerNews chain config & viem client helpers.
 *
 * Two concepts:
 *   getDukerChain()  — The chain where DukerNews contract is deployed.
 *                      Driven by DUKER_NEWS_CHAIN env variable (set in .dev.vars / wrangler env):
 *                        DUKER_NEWS_CHAIN=local    → Anvil localhost (default)
 *                        DUKER_NEWS_CHAIN=sepolia  → Sepolia testnet
 *                        DUKER_NEWS_CHAIN=xlayer   → XLayer mainnet
 *
 *   getPaymentChainConfig(chainId)
 *                  — Resolve config for a payment chain where x402 settles
 *                     stablecoin transfers. The payment chain may differ from the
 *                     DukerNews chain (e.g. pay on BNB with USD1, mint on XLayer).
 */

import { ADDRESSES, SUPPORTED_CHAINS, LOCAL_CHAIN_ID, SEPOLIA_CHAIN_ID, XLAYER_CHAIN_ID } from './contracts'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

// Anvil account #0 — local dev fallback only
const ANVIL_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const

/**
 * Get the operator signer account for gasless (x402) transactions.
 * Reads OP_RELAY_SECRET from env; falls back to Anvil #0 for local dev.
 */
export function getOperatorAccount() {
    const key = (process.env.OP_RELAY_SECRET || ANVIL_KEY) as `0x${string}`
    return privateKeyToAccount(key)
}

/**
 * Get the DukerNews chain config — where the contract is deployed.
 * This is always env-driven (one deployment per server instance).
 */
export function getDukerChain() {
    // Cloudflare Workers (production) → xlayer; local dev → local
    // Explicit DUKER_NEWS_CHAIN env var always wins if set
    const chainEnv = process.env.DUKER_NEWS_CHAIN || (process.env.NODE_ENV === 'production' ? 'xlayer' : 'local')

    switch (chainEnv) {
        case 'sepolia':
            return {
                chainId: SEPOLIA_CHAIN_ID,
                addrs: ADDRESSES[SEPOLIA_CHAIN_ID],
                deployBlock: 10_536_920n,  // DukerNews proxy deploy block (2026-03-28 fresh deploy)
                viemChain: {
                    id: SEPOLIA_CHAIN_ID,
                    name: 'Sepolia',
                    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                    rpcUrls: { default: { http: [process.env.RPC_URL_SEPOLIA ?? 'https://blockchain.googleapis.com/v1/projects/gen-lang-client-0353869734/locations/asia-east1/endpoints/ethereum-sepolia/rpc?key=AIzaSyCygRUVltm8-BXV9UwAjKLAS6lwk8LjRFg'] } },
                } as const,
                rpcUrl: process.env.RPC_URL_SEPOLIA ?? 'https://blockchain.googleapis.com/v1/projects/gen-lang-client-0353869734/locations/asia-east1/endpoints/ethereum-sepolia/rpc?key=AIzaSyCygRUVltm8-BXV9UwAjKLAS6lwk8LjRFg',
            }

        case 'xlayer':
            return {
                chainId: XLAYER_CHAIN_ID,
                addrs: ADDRESSES[XLAYER_CHAIN_ID],
                deployBlock: 55_950_000n,  // DukerNews proxy deploy block on XLayer (2026-03-28)
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
                deployBlock: 0n,
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
 */
export function getPaymentChainConfig(chainId: number) {
    const chain = SUPPORTED_CHAINS.find(c => c.id === chainId)
    if (!chain) return null
    return chain
}

/**
 * Get ready-to-use viem clients for the DukerNews chain.
 * Returns publicClient, walletClient (operator signer), and chain config.
 */
export function getDukerChainClients() {
    const duker = getDukerChain()
    const { viemChain, rpcUrl } = duker
    const operatorAccount = getOperatorAccount()

    const publicClient = createPublicClient({
        chain: viemChain as any,
        transport: http(rpcUrl),
    })
    const walletClient = createWalletClient({
        account: operatorAccount,
        chain: viemChain as any,
        transport: http(rpcUrl),
    })

    return { ...duker, publicClient, walletClient, operatorAccount }
}
