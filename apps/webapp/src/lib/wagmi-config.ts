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

// Chain list driven by VITE_DUKER_NEWS_CHAIN env:
//   xlayer  → X Layer only (production)
//   sepolia → Sepolia only (testnet)
//   local   → Anvil + Sepolia (dev)
// Only the DukerNews chain is registered in wagmi — cross-chain balance reads use
// the DukiPayment UI fallback ('—') when a non-DukerNews chain is selected.
const chains =
    chainEnv === 'xlayer' ? ([xLayer] as const)
        : chainEnv === 'sepolia' ? ([sepolia] as const)
            : ([anvil, sepolia] as const)

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
        ...(chainEnv === 'local' ? { [anvil.id]: http('http://127.0.0.1:8545') } : {}),
    } as any,
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
})

