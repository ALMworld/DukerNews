import type { Address } from 'viem'

// ── Chain IDs ─────────────────────────────────────────────────────────────────
export const LOCAL_CHAIN_ID = 31337
export const SEPOLIA_CHAIN_ID = 11155111
export const XLAYER_CHAIN_ID = 196

// ── Active chain — driven by VITE_CHAIN env variable ─────────────────────────
//   VITE_CHAIN=local    → Anvil localhost (default)
//   VITE_CHAIN=sepolia  → Sepolia testnet
//   VITE_CHAIN=xlayer   → XLayer mainnet
const chainEnv = (import.meta as any).env?.VITE_CHAIN ?? 'local'
export const DEFAULT_CHAIN_ID: number =
    chainEnv === 'sepolia' ? SEPOLIA_CHAIN_ID
    : chainEnv === 'xlayer' ? XLAYER_CHAIN_ID
    : LOCAL_CHAIN_ID

// ── Contract addresses (non-stablecoin) ──────────────────────────────────────
export const ADDRESSES: Record<number, { DukerNews: Address; Treasury: Address }> = {
    [LOCAL_CHAIN_ID]: {
        DukerNews: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
        Treasury: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    },
    [SEPOLIA_CHAIN_ID]: {
        DukerNews: '0x127600D0833296D0722f265fd90C19DfD51EAd79',
        Treasury: '0xF4A630F0A939DB59dD35408ecfd6Ea3429C87F5c',
    },
    [XLAYER_CHAIN_ID]: {
        DukerNews: '0x4E622724cd88AB0CEC2E8304AE4EDAf6c00ac22f',
        Treasury: '0xfe0a6760458A1E75c284B9903ecc64D2B87c00a6',
    },
}

// ── Stablecoin metadata ──────────────────────────────────────────────────────
export type StablecoinMeta = {
    symbol: string       // 'USDT0', 'USDC', 'DAI'
    name: string         // 'Tether USD'
    address: Address
    decimals: number     // 6 for USDT/USDC, 18 for DAI
}

// ── Chain metadata for UI chain selector ──────────────────────────────────────
export type ChainMeta = {
    id: number
    name: string
    stablecoins: StablecoinMeta[]
    explorerUrl: string
    isHome: boolean  // true = main deployment chain, both methods; false = x402 only
}

export const SUPPORTED_CHAINS: ChainMeta[] = [
    {
        id: XLAYER_CHAIN_ID,
        name: 'XLayer',
        stablecoins: [
            { symbol: 'USDT0', name: 'USD₮0', address: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736' as Address, decimals: 6 },
        ],
        explorerUrl: 'https://www.okx.com/web3/explorer/xlayer',
        isHome: DEFAULT_CHAIN_ID === XLAYER_CHAIN_ID,
    },
    {
        id: SEPOLIA_CHAIN_ID,
        name: 'Sepolia',
        stablecoins: [
            { symbol: 'USDT (Test)', name: 'Test USDT', address: '0xdFc84469Bf8c7A2ba98090bde94f5F9fc3Ec2066' as Address, decimals: 6 },
        ],
        explorerUrl: 'https://sepolia.etherscan.io',
        isHome: DEFAULT_CHAIN_ID === SEPOLIA_CHAIN_ID,
    },
    {
        id: LOCAL_CHAIN_ID,
        name: 'Anvil',
        stablecoins: [
            { symbol: 'USDT (Mock)', name: 'Mock USDT', address: '0x5FbDB2315678afecb367f032d93F642f64180aa3' as Address, decimals: 6 },
            { symbol: 'USDC (Mock)', name: 'Mock USDC', address: '0x5FbDB2315678afecb367f032d93F642f64180aa3' as Address, decimals: 6 },
        ],
        explorerUrl: '',
        isHome: DEFAULT_CHAIN_ID === LOCAL_CHAIN_ID,
    },
].filter(c => {
    // Only include chains with non-zero contract addresses
    const addrs = ADDRESSES[c.id]
    return addrs && addrs.DukerNews !== '0x0000000000000000000000000000000000000000'
})

// ── Helpers ──────────────────────────────────────────────────────────────────
/** Get the default (first) stablecoin for a given chain */
export function getDefaultStablecoin(chainId: number): StablecoinMeta {
    const chain = SUPPORTED_CHAINS.find(c => c.id === chainId)
    if (chain && chain.stablecoins.length > 0) return chain.stablecoins[0]
    // Fallback for unknown chains — use local mock
    const local = SUPPORTED_CHAINS.find(c => c.id === LOCAL_CHAIN_ID)
    return local?.stablecoins[0] ?? { symbol: 'USDT', name: 'USDT', address: '0x0000000000000000000000000000000000000000' as Address, decimals: 6 }
}

/** Get all stablecoins for a given chain */
export function getStablecoins(chainId: number): StablecoinMeta[] {
    const chain = SUPPORTED_CHAINS.find(c => c.id === chainId)
    return chain?.stablecoins ?? []
}

// ── ABIs ────────────────────────────────────────────────────────────────────
// Re-export auto-generated ABIs from @alm/duker-dao-contract (wagmi CLI)
export { dukerNewsAbi, mockUsdtAbi } from '@alm/duker-dao-contract'

// ERC20 minimal ABI (approve, allowance, balanceOf) — not contract-specific
export const ERC20_ABI = [
    {
        type: 'function',
        name: 'approve',
        inputs: [
            { name: 'spender', type: 'address', internalType: 'address' },
            { name: 'amount', type: 'uint256', internalType: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'allowance',
        inputs: [
            { name: 'owner', type: 'address', internalType: 'address' },
            { name: 'spender', type: 'address', internalType: 'address' },
        ],
        outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'balanceOf',
        inputs: [{ name: 'account', type: 'address', internalType: 'address' }],
        outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
        stateMutability: 'view',
    },
] as const
