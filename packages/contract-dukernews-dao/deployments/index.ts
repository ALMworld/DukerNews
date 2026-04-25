/**
 * deployments/index.ts — Canonical deployment addresses for DukerNews DAO.
 *
 * Keyed by chain ID:
 *   31337    = Anvil (local dev) — updated by deploy scripts
 *   196      = X Layer (mainnet)
 *   11155111 = Sepolia (testnet)
 *
 * Consumers: webapp, e2e tests.
 * DO NOT duplicate these addresses elsewhere — import from this module.
 */

import type { Address } from 'viem'

export interface DaoDeployment {
    /** DukerNews UUPS proxy */
    dukerNews: Address
    /** DukerNews implementation */
    dukerNewsImpl: Address
    /** Treasury address */
    treasury: Address
    /** Stablecoin used for minting (USDT0 on mainnet, MockUSDT on testnet/local) */
    stablecoin: Address
    /** Mock stablecoin — only present on testnets & local */
    mockUsdt?: Address
}

const LOCAL: DaoDeployment = {
    dukerNews: '0xc0F115A19107322cFBf1cDBC7ea011C19EbDB4F8',
    dukerNewsImpl: '0xF8e31cb472bc70500f08Cd84917E5A1912Ec8397',
    treasury: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    stablecoin: '0x2B0d36FACD61B71CC05ab8F3D2355ec3631C0dd5',
    mockUsdt: '0x2B0d36FACD61B71CC05ab8F3D2355ec3631C0dd5',
}

const XLAYER: DaoDeployment = {
    dukerNews: '0x348C88cC171bffDB9128bc9DEcDa49c0820FB29F',
    dukerNewsImpl: '0x565C8206D626dc9Ddee7f1958A96602cA5dAd32c',
    treasury: '0xfe0a6760458A1E75c284B9903ecc64D2B87c00a6',
    stablecoin: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736', // USDT0
}

const SEPOLIA: DaoDeployment = {
    dukerNews: '0xEEfb66A4656fB695D6f718676A1D57aF023d1F6f',
    dukerNewsImpl: '0xD25fBEeCd88F141F9123a45B70F806F084479f33',
    treasury: '0xBB68A2363861d595cfF23abE0AC247fd36c0e7E7',
    stablecoin: '0x60Aad2540Cc4CE0FA6188a796fD9b8e48917004c', // MockUSDT
    mockUsdt: '0x60Aad2540Cc4CE0FA6188a796fD9b8e48917004c',
}

/**
 * All DukerNews DAO deployments, keyed by chain ID.
 */
export const daoDeployments: Record<number, DaoDeployment> = {
    31337: LOCAL,
    196: XLAYER,
    11155111: SEPOLIA,
}

/**
 * Lookup helper — throws if the chain has no deployment.
 */
export function getDaoDeployment(chainId: number): DaoDeployment {
    const d = daoDeployments[chainId]
    if (!d) throw new Error(`No DukerNews DAO deployment for chain ${chainId}`)
    return d
}
