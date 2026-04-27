import type { Address } from 'viem'
import { almDeployments } from 'contract-duki-alm-world/deployments'
import { daoDeployments } from '@alm/dukernews-dao-contract/deployments'

// ── Chain IDs ─────────────────────────────────────────────────────────────────
export const LOCAL_CHAIN_ID = 31337
export const SEPOLIA_CHAIN_ID = 11155111
export const XLAYER_CHAIN_ID = 196

// ── Active chain — driven by VITE_DUKER_NEWS_CHAIN env variable ──────────────
//   VITE_DUKER_NEWS_CHAIN=local    → Anvil localhost (default)
//   VITE_DUKER_NEWS_CHAIN=sepolia  → Sepolia testnet
//   VITE_DUKER_NEWS_CHAIN=xlayer   → XLayer mainnet
const chainEnv = (import.meta as any).env?.VITE_DUKER_NEWS_CHAIN ?? 'local'
export const DEFAULT_CHAIN_ID: number =
    chainEnv === 'sepolia' ? SEPOLIA_CHAIN_ID
        : chainEnv === 'xlayer' ? XLAYER_CHAIN_ID
            : LOCAL_CHAIN_ID

// ── Global approve floor (in micro-units, 6 decimals) ────────────────────────
// Always approve at least this much to avoid re-approving on small transactions.
// 64 USDT = 64_000_000 micro-units.
// export const MIN_APPROVE_MICRO = BigInt(64_000_000)
export const MIN_APPROVE_MICRO = BigInt(8_000_000)

// ── Chain EID mapping (chain ID → LayerZero Endpoint ID) ─────────────────────
export const CHAIN_ID_TO_EID: Record<number, number> = {
    31337: 31337,       // local Anvil uses chainId as EID
    196: 30274,         // XLayer
    11155111: 11155111, // Sepolia (no LZ EID yet, use chainId)
}

// ── Contract addresses — derived from canonical package exports ──────────────
function buildAddresses(chainId: number): {
    DukerNews: Address; Treasury: Address;
    DukigenRegistry: Address; DukerRegistry: Address;
    DUKIToken: Address; ALMToken: Address; AlmWorldDukiMinter: Address;
} | undefined {
    const eid = CHAIN_ID_TO_EID[chainId] ?? chainId
    const alm = almDeployments[eid]
    const dao = daoDeployments[chainId]
    if (!alm || !dao) return undefined
    return {
        DukerNews: dao.dukerNews,
        Treasury: dao.treasury,
        DukigenRegistry: alm.dukigenRegistry,
        DukerRegistry: alm.dukerRegistry,
        DUKIToken: alm.dukiToken,
        ALMToken: alm.almToken,
        AlmWorldDukiMinter: alm.almWorldDukiMinter,
    }
}

export const ADDRESSES: Record<number, {
    DukerNews: Address; Treasury: Address;
    DukigenRegistry: Address; DukerRegistry: Address;
    DUKIToken: Address; ALMToken: Address; AlmWorldDukiMinter: Address;
}> = Object.fromEntries(
    [LOCAL_CHAIN_ID, SEPOLIA_CHAIN_ID, XLAYER_CHAIN_ID]
        .map(id => [id, buildAddresses(id)] as const)
        .filter((entry): entry is [number, NonNullable<ReturnType<typeof buildAddresses>>] => entry[1] != null)
)

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
        stablecoins: almDeployments[CHAIN_ID_TO_EID[LOCAL_CHAIN_ID] ?? LOCAL_CHAIN_ID]?.mockUsdt
            ? [{ symbol: 'USDT (Mock)', name: 'Mock USDT', address: almDeployments[CHAIN_ID_TO_EID[LOCAL_CHAIN_ID] ?? LOCAL_CHAIN_ID].mockUsdt! as Address, decimals: 6 }]
            : [],
        explorerUrl: '',
        isHome: DEFAULT_CHAIN_ID === LOCAL_CHAIN_ID,
        nativeCurrency: { symbol: 'ETH', decimals: 18 },
    },
].filter(c => {
    // Only include chains with non-zero contract addresses
    const addrs = ADDRESSES[c.id]
    if (!addrs || addrs.DukerNews === '0x0000000000000000000000000000000000000000') return false
    // DEMO_MODE: only show the active chain
    if (DEMO_MODE) return c.id === DEFAULT_CHAIN_ID
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
// Re-export auto-generated ABIs from @alm/dukernews-dao-contract (wagmi CLI)
export { dukerNewsAbi, mockUsdtAbi } from '@alm/dukernews-dao-contract'

// Re-export auto-generated ABIs from contract_duki_alm_world (wagmi CLI)
export { dukerRegistryAbi, dukigenRegistryAbi } from 'contract-duki-alm-world'

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

