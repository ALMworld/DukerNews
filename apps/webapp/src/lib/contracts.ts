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

// ── Global approve floor (in micro-units, 6 decimals) ────────────────────────
// Always approve at least this much to avoid re-approving on small transactions.
// 64 USDT = 64_000_000 micro-units.
// export const MIN_APPROVE_MICRO = BigInt(64_000_000)
export const MIN_APPROVE_MICRO = BigInt(8_000_000)

// ── Contract addresses (non-stablecoin) ──────────────────────────────────────
export const ADDRESSES: Record<number, { DukerNews: Address; Treasury: Address }> = {
    [LOCAL_CHAIN_ID]: {
        DukerNews: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
        Treasury: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    },
    [SEPOLIA_CHAIN_ID]: {
        DukerNews: '0xEEfb66A4656fB695D6f718676A1D57aF023d1F6f',
        Treasury: '0xBB68A2363861d595cfF23abE0AC247fd36c0e7E7',
    },
    [XLAYER_CHAIN_ID]: {
        DukerNews: '0x348C88cC171bffDB9128bc9DEcDa49c0820FB29F',
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
    /** Native gas token symbol — OKB on XLayer, ETH on Ethereum/Sepolia */
    nativeCurrency: { symbol: string; decimals: number }
}

// ── Demo display override ────────────────────────────────────────────────────
// Toggle DEMO_MODE to false to restore real chain names (Sepolia, USDT Test, etc.)
const DEMO_MODE = false

export const DEMO_DISPLAY = DEMO_MODE
    ? {
        chainName: 'X Layer',
        stablecoinSymbol: 'USDT',
        stablecoinName: 'USD₮0',
        explorerUrl: 'https://www.okx.com/web3/explorer/xlayer',
        gasSymbol: 'OKB',
        gasDecimals: 18,
    }
    : {
        chainName: 'Sepolia',
        stablecoinSymbol: 'USDT (Test)',
        stablecoinName: 'Mock USDT',
        explorerUrl: 'https://sepolia.etherscan.io',
        gasSymbol: 'ETH',
        gasDecimals: 18,
    }

export const SUPPORTED_CHAINS: ChainMeta[] = [
    {
        id: XLAYER_CHAIN_ID,
        name: 'XLayer',
        stablecoins: [
            { symbol: 'USDT', name: 'USD₮0', address: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736' as Address, decimals: 6 },
        ],
        explorerUrl: 'https://www.okx.com/web3/explorer/xlayer',
        isHome: DEFAULT_CHAIN_ID === XLAYER_CHAIN_ID,
        nativeCurrency: { symbol: 'OKB', decimals: 18 },
    },
    {
        id: SEPOLIA_CHAIN_ID,
        name: DEMO_DISPLAY.chainName,
        stablecoins: [
            { symbol: DEMO_DISPLAY.stablecoinSymbol, name: DEMO_DISPLAY.stablecoinName, address: '0x60Aad2540Cc4CE0FA6188a796fD9B8e48917004c' as Address, decimals: 6 },
        ],
        explorerUrl: DEMO_DISPLAY.explorerUrl,
        isHome: DEFAULT_CHAIN_ID === SEPOLIA_CHAIN_ID,
        nativeCurrency: { symbol: DEMO_DISPLAY.gasSymbol, decimals: DEMO_DISPLAY.gasDecimals },
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
        nativeCurrency: { symbol: 'ETH', decimals: 18 },
    },
].filter(c => {
    // Only include chains with non-zero contract addresses
    const addrs = ADDRESSES[c.id]
    if (!addrs || addrs.DukerNews === '0x0000000000000000000000000000000000000000') return false
    // DEMO_MODE: only show the active chain
    if (DEMO_MODE || true) return c.id === DEFAULT_CHAIN_ID
    return true
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
