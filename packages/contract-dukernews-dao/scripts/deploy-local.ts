#!/usr/bin/env tsx
/**
 * deploy-local.ts — Deploy DukerNews DAO (MockUSDT + DukerNews proxy) to local Anvil.
 *
 * Lives in: packages/contract-dukernews-dao/scripts/
 *
 * Reads registry addresses from contract_duki_alm_world/deployments/index.ts.
 *
 * Output: patches deployments/index.ts (LOCAL block)
 */

import { createWalletClient, createPublicClient, http, encodeFunctionData, getAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { almDeployments } from 'contract-duki-alm-world/deployments'

const __dirname = dirname(fileURLToPath(import.meta.url))

const ANVIL_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
const ANVIL_ACCOUNT = privateKeyToAccount(ANVIL_PRIVATE_KEY)
const RPC_URL = 'http://127.0.0.1:8545'

const walletClient = createWalletClient({
    account: ANVIL_ACCOUNT,
    chain: foundry,
    transport: http(RPC_URL),
})

const publicClient = createPublicClient({
    chain: foundry,
    transport: http(RPC_URL),
})

// ── Helpers ────────────────────────────────────────────────────

function loadArtifact(path: string): { abi: any[]; bytecode: `0x${string}` } {
    const pkgDir = resolve(__dirname, '..')
    const json = JSON.parse(readFileSync(resolve(pkgDir, path), 'utf-8'))
    const bc = json.bytecode?.object ?? json.bytecode
    if (!bc || bc === '0x') throw new Error(`No bytecode found in ${path}`)
    return { abi: json.abi, bytecode: bc as `0x${string}` }
}

async function deploy(abi: any[], bytecode: `0x${string}`, args: any[] = []): Promise<`0x${string}`> {
    const hash = await walletClient.deployContract({ abi, bytecode, args })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (!receipt.contractAddress) throw new Error('Deploy failed — no contract address')
    return getAddress(receipt.contractAddress)
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
    console.log('🔧 Deploying DukerNews DAO to local Anvil...\n')

    // Read ALM stack addresses from canonical source
    const alm = almDeployments[31337]
    let dukerRegistryAddr = '0x0000000000000000000000000000000000000000' as `0x${string}`

    if (alm) {
        dukerRegistryAddr = alm.dukerRegistry
        console.log(`  Using ALM stack addresses:`)
        console.log(`    DukerRegistry:       ${dukerRegistryAddr}`)
        console.log(`    AlmWorldDukiMinter:  ${alm.almWorldDukiMinter}\n`)
    } else {
        console.log(`  ⚠️  No ALM stack found — using zeroed registry addresses\n`)
    }

    // 1. MockUSDT — reuse ALM stack's if available, otherwise deploy a new one
    const mockUsdtArtifact = loadArtifact('out/MockUSDT.sol/MockUSDT.json')
    let mockUsdtAddr: `0x${string}`
    let usdtMethod: string
    if (alm?.mockUsdt) {
        mockUsdtAddr = alm.mockUsdt
        usdtMethod = 'transfer'
        console.log(`  [1/3] Reusing ALM stack MockUSDT: ${mockUsdtAddr}`)
    } else {
        console.log('  [1/3] Deploying MockUSDT...')
        mockUsdtAddr = await deploy(mockUsdtArtifact.abi, mockUsdtArtifact.bytecode, [])
        usdtMethod = 'mint'
        console.log(`        ✓ MockUSDT: ${mockUsdtAddr}`)
    }

    // 2. Deploy DukerNews implementation
    console.log('  [2/3] Deploying DukerNews implementation...')
    const dukerNewsArtifact = loadArtifact('out/DukerNews.sol/DukerNews.json')
    const implAddr = await deploy(dukerNewsArtifact.abi, dukerNewsArtifact.bytecode, [])
    console.log(`        ✓ Implementation: ${implAddr}`)

    // 3. Deploy ERC1967Proxy + initialize
    console.log('  [3/3] Deploying ERC1967Proxy + initialize...')
    const proxyArtifact = loadArtifact('out/ERC1967Proxy.sol/ERC1967Proxy.json')
    const almWorldDukiMinterAddr = alm?.almWorldDukiMinter ?? '0x0000000000000000000000000000000000000000' as `0x${string}`
    const agentId = alm ? (1n << 32n) | BigInt(31337) : 0n
    const initData = encodeFunctionData({
        abi: dukerNewsArtifact.abi,
        functionName: 'initialize',
        args: [dukerRegistryAddr, almWorldDukiMinterAddr, agentId],
    })
    const proxyAddr = await deploy(proxyArtifact.abi, proxyArtifact.bytecode, [implAddr, initData])
    console.log(`        ✓ Proxy (DukerNews): ${proxyAddr}`)

    // 3b. Configure DukerRegistry to use AlmWorldDukiMinter for payment-gated minting
    if (dukerRegistryAddr !== '0x0000000000000000000000000000000000000000' && alm?.almWorldDukiMinter) {
        console.log('        → Setting AlmWorldDukiMinter on DukerRegistry...')
        const registryArtifact = JSON.parse(
            readFileSync(resolve(__dirname, '../../contract_duki_alm_world/out/DukerRegistry.sol/DukerRegistry.json'), 'utf-8')
        )
        const minterTx = await walletClient.writeContract({
            address: dukerRegistryAddr,
            abi: registryArtifact.abi,
            functionName: 'setAlmWorldDukiMinter',
            args: [alm.almWorldDukiMinter],
        })
        await publicClient.waitForTransactionReceipt({ hash: minterTx })
        console.log(`        ✓ DukerRegistry.setAlmWorldDukiMinter(${alm.almWorldDukiMinter})`)
    }

    // 4. Distribute USDT to test accounts
    console.log('        → Distributing USDT to test accounts...')
    const distributeAmount = 10_000n * 1_000_000n
    const testAccounts = [
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
        '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
        '0xBB68A2363861d595cfF23abE0AC247fd36c0e7E7', // dev wallet
    ] as const
    for (const account of testAccounts) {
        const hash = await walletClient.writeContract({
            address: mockUsdtAddr,
            abi: mockUsdtArtifact.abi,
            functionName: usdtMethod,
            args: [account, distributeAmount],
        })
        await publicClient.waitForTransactionReceipt({ hash })
    }
    console.log(`        ✓ Distributed to ${testAccounts.length} accounts (via ${usdtMethod})`)

    // 4b. Fund non-Anvil accounts with ETH
    const externalAccounts = ['0xBB68A2363861d595cfF23abE0AC247fd36c0e7E7'] as const
    for (const account of externalAccounts) {
        const hash = await walletClient.sendTransaction({
            to: account as `0x${string}`,
            value: 100n * 10n ** 18n, // 100 ETH
        })
        await publicClient.waitForTransactionReceipt({ hash })
    }
    console.log(`        ✓ Funded ${externalAccounts.length} external accounts with 100 ETH`)

    // 5. Patch deployments/index.ts
    const deploymentsPath = resolve(__dirname, '../deployments/index.ts')
    let deploymentsContent = readFileSync(deploymentsPath, 'utf-8')

    const localBlock = `const LOCAL: DaoDeployment = {
    dukerNews: '${proxyAddr}',
    dukerNewsImpl: '${implAddr}',
    treasury: '${ANVIL_ACCOUNT.address}',
    stablecoin: '${mockUsdtAddr}',
    mockUsdt: '${mockUsdtAddr}',
}`

    deploymentsContent = deploymentsContent.replace(
        /const LOCAL: DaoDeployment = \{[^}]+\}/s,
        localBlock,
    )
    writeFileSync(deploymentsPath, deploymentsContent)

    console.log(`\n✅ DukerNews DAO deployed! Addresses patched in deployments/index.ts`)
    console.log(`  MockUSDT:          ${mockUsdtAddr}`)
    console.log(`  DukerNews (proxy): ${proxyAddr}`)
    console.log(`  DukerNews (impl):  ${implAddr}`)
}

main().catch((err) => {
    console.error('❌ Deploy failed:', err)
    process.exit(1)
})
