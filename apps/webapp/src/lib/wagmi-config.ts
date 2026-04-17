import { http, createConfig, createStorage, cookieStorage } from 'wagmi'
import { xLayer, sepolia } from 'wagmi/chains'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'
import { defineChain } from 'viem'

// Anvil local dev chain
const anvil = defineChain({
    id: 31337,
    name: 'Anvil Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
})

// Production build (vite build) → xlayer; dev server → local
// Explicit VITE_DUKER_NEWS_CHAIN always wins if set
const chainEnv =
    (import.meta as any).env?.VITE_DUKER_NEWS_CHAIN ||
    ((import.meta as any).env?.PROD ? 'xlayer' : 'local')

const projectId =
    (import.meta as any).env?.VITE_REOWN_PROJECT_ID ||
    '8da46244987cf7cdc239c7edb3c0a6a8'

export { projectId }

// All supported chains are always registered so switchChainAsync works for any chain.
// VITE_DUKER_NEWS_CHAIN only controls the default chain for the UI, not which chains are available.
const chains =
    chainEnv === 'xlayer' ? ([xLayer, sepolia] as const)
        : chainEnv === 'sepolia' ? ([sepolia, xLayer, anvil] as const)
            : ([anvil, sepolia, xLayer] as const)

export const wagmiConfig = createConfig({
    chains,
    connectors: [
        injected(),
        walletConnect({ projectId }),
        coinbaseWallet({ appName: 'Duker News' }),
    ],
    transports: {
        [xLayer.id]: http(),
        [sepolia.id]: http('https://1rpc.io/sepolia'),
        [anvil.id]: http('http://127.0.0.1:8545'),
    } as any,
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
})

