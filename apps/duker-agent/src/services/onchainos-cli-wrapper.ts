/**
 * OnchainOS CLI Wrapper
 *
 * Wraps the `onchainos` CLI binary for wallet operations.
 * The CLI handles all complex crypto (HPKE, ed25519, JWT refresh) internally.
 *
 * Requires: `onchainos` CLI installed at ~/.local/bin/onchainos
 *   Install: curl -fsSL https://raw.githubusercontent.com/aspect-build/onchainos-skills/main/install.sh | bash
 *   Login:   onchainos wallet login (with OKX_API_KEY env)
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

const execFileAsync = promisify(execFile)

// ── CLI binary resolution ───────────────────────────────────────────────

const CLI_PATHS = [
    path.join(os.homedir(), '.local', 'bin', 'onchainos'),
    '/usr/local/bin/onchainos',
    'onchainos', // fallback to PATH
]

function findCli(): string | null {
    for (const p of CLI_PATHS) {
        if (p === 'onchainos') return p // PATH lookup
        if (fs.existsSync(p)) return p
    }
    return null
}

let cachedCliPath: string | null | undefined

function getCliPath(): string {
    if (cachedCliPath === undefined) {
        cachedCliPath = findCli()
    }
    if (!cachedCliPath) {
        throw new Error(
            'onchainos CLI not found. Install it:\n' +
            '  curl -fsSL https://raw.githubusercontent.com/aspect-build/onchainos-skills/main/install.sh | bash'
        )
    }
    return cachedCliPath
}

// ── Low-level exec ──────────────────────────────────────────────────────

/**
 * Standard CLI JSON envelope:
 * Success: { ok: true, data: { ... } }
 * Error:   { ok: false, error: { code: "...", msg: "..." } }
 */
interface CliJsonEnvelope {
    ok: boolean
    data?: any
    error?: { code: string; msg: string }
}

/** Run an onchainos CLI command and parse JSON output. */
async function runCli(args: string[], timeoutMs = 30_000): Promise<{ ok: boolean; data: any; raw: string; errorMsg?: string }> {
    const cli = getCliPath()
    try {
        const { stdout } = await execFileAsync(cli, args, {
            timeout: timeoutMs,
            env: { ...process.env, NO_COLOR: '1' },
        })
        const raw = stdout.trim()
        try {
            const parsed: CliJsonEnvelope = JSON.parse(raw)
            if (parsed.ok) {
                return { ok: true, data: parsed.data, raw }
            } else {
                const msg = parsed.error?.msg || 'Unknown CLI error'
                return { ok: false, data: null, raw, errorMsg: msg }
            }
        } catch {
            return { ok: true, data: null, raw }
        }
    } catch (err: any) {
        const output = (err.stdout || err.stderr || err.message || '').trim()
        // Try parsing error output as JSON
        try {
            const parsed: CliJsonEnvelope = JSON.parse(output)
            return { ok: false, data: null, raw: output, errorMsg: parsed.error?.msg || output }
        } catch {
            return { ok: false, data: null, raw: output, errorMsg: output }
        }
    }
}

// ── Wallet Status ───────────────────────────────────────────────────────

export interface WalletStatus {
    installed: boolean
    loggedIn: boolean
    address: string | null
    accountName: string | null
    accountId: string | null
    loginType: string | null
}

/** Check if CLI is installed and user is logged in. */
export async function getWalletStatus(): Promise<WalletStatus> {
    const installed = findCli() !== null
    if (!installed) {
        return { installed: false, loggedIn: false, address: null, accountName: null, accountId: null, loginType: null }
    }

    try {
        // `onchainos wallet status` returns: { ok, data: { loggedIn, currentAccountId, currentAccountName, ... } }
        const result = await runCli(['wallet', 'status'], 5000)
        if (result.ok && result.data?.loggedIn) {
            // Get address from `wallet addresses`
            let address: string | null = null
            try {
                const addrResult = await runCli(['wallet', 'addresses'], 5000)
                if (addrResult.ok && addrResult.data) {
                    // Prefer X Layer address, then EVM, then Solana
                    const xlayer = addrResult.data.xlayer?.[0]
                    const evm = addrResult.data.evm?.[0]
                    address = xlayer?.address || evm?.address || null
                }
            } catch { /* ok, address is optional */ }

            return {
                installed: true,
                loggedIn: true,
                address,
                accountName: result.data.currentAccountName || null,
                accountId: result.data.currentAccountId || null,
                loginType: result.data.loginType || null,
            }
        }
        return { installed: true, loggedIn: false, address: null, accountName: null, accountId: null, loginType: null }
    } catch {
        return { installed: true, loggedIn: false, address: null, accountName: null, accountId: null, loginType: null }
    }
}

// ── Balance ─────────────────────────────────────────────────────────────

export interface TokenBalance {
    symbol: string
    balance: string
    tokenAddress: string
    tokenPrice: string
    chainId: string
}

/**
 * Get wallet balances.
 * CLI: `onchainos wallet balance [--chain <chainIndex>]`
 * Returns: { ok, data: { totalValueUsd, details: [{ tokenAssets: [...] }] } }
 */
export async function getBalances(chain?: string): Promise<{ totalValueUsd: string; tokens: TokenBalance[] }> {
    const args = ['wallet', 'balance']
    if (chain) args.push('--chain', chain)

    const result = await runCli(args, 15_000)
    if (!result.ok) {
        throw new Error(`Balance query failed: ${result.errorMsg || result.raw}`)
    }

    const totalValueUsd = result.data?.totalValueUsd || '0.00'
    const tokens: TokenBalance[] = []
    const details = result.data?.details || []
    for (const detail of details) {
        for (const asset of (detail.tokenAssets || [])) {
            tokens.push({
                symbol: asset.symbol || '???',
                balance: asset.balance || '0',
                tokenAddress: asset.tokenAddress || '',
                tokenPrice: asset.tokenPrice || '0',
                chainId: asset.chainId || chain || '',
            })
        }
    }
    return { totalValueUsd, tokens }
}

// ── Contract Call ───────────────────────────────────────────────────────

export interface ContractCallParams {
    to: string
    chain: string          // realChainIndex, e.g. "196" for X Layer
    inputData: string      // hex-encoded calldata
    amount?: string        // value in minimal units (default "0")
    gasLimit?: string
    force?: boolean        // skip confirmation prompts
}

export interface ContractCallResult {
    txHash: string
}

/** Execute a contract call via OnchainOS TEE-signed transaction. */
export async function contractCall(params: ContractCallParams): Promise<ContractCallResult> {
    const args = [
        'wallet', 'contract-call',
        '--to', params.to,
        '--chain', params.chain,
        '--amt', params.amount || '0',
        '--input-data', params.inputData,
    ]
    if (params.gasLimit) {
        args.push('--gas-limit', params.gasLimit)
    }
    if (params.force !== false) {
        args.push('--force') // default: skip confirmation
    }

    const result = await runCli(args, 60_000) // 60s timeout for txns
    if (!result.ok) {
        throw new Error(`Contract call failed: ${result.errorMsg || result.raw}`)
    }

    const txHash = result.data?.txHash || ''
    if (!txHash) {
        throw new Error(`No txHash in response: ${result.raw}`)
    }
    return { txHash }
}

// ── Send (native token transfer) ────────────────────────────────────────

export interface SendParams {
    to: string
    chain: string
    amount: string        // minimal units
    token?: string        // contract address for ERC-20 transfer
    force?: boolean
}

/** Send native token or ERC-20 transfer. */
export async function send(params: SendParams): Promise<ContractCallResult> {
    const args = [
        'wallet', 'send',
        '--amt', params.amount,
        '--receipt', params.to,
        '--chain', params.chain,
    ]
    if (params.token) {
        args.push('--contract-token', params.token)
    }
    if (params.force !== false) {
        args.push('--force')
    }

    const result = await runCli(args, 60_000)
    if (!result.ok) {
        throw new Error(`Send failed: ${result.errorMsg || result.raw}`)
    }
    return { txHash: result.data?.txHash || '' }
}

// ── Transaction History ─────────────────────────────────────────────────

/** Get recent transaction history. */
export async function getHistory(limit = 10): Promise<any[]> {
    const result = await runCli(['wallet', 'history', '--limit', String(limit)])
    if (!result.ok) return []
    if (Array.isArray(result.data)) return result.data
    return result.data?.orders || []
}

// ── Addresses ───────────────────────────────────────────────────────────

export interface WalletAddresses {
    evm: Array<{ address: string; chainIndex: string; chainName: string }>
    xlayer: Array<{ address: string; chainIndex: string; chainName: string }>
    solana: Array<{ address: string; chainIndex: string; chainName: string }>
}

/** Get all wallet addresses grouped by chain type. */
export async function getAddresses(): Promise<WalletAddresses> {
    const result = await runCli(['wallet', 'addresses'], 5000)
    if (!result.ok) {
        throw new Error(`Failed to get addresses: ${result.errorMsg || result.raw}`)
    }
    return {
        evm: result.data?.evm || [],
        xlayer: result.data?.xlayer || [],
        solana: result.data?.solana || [],
    }
}

// ── Login ───────────────────────────────────────────────────────────────

/**
 * Login via API key (non-interactive).
 * Reads OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE from env.
 * The CLI handles all crypto (HPKE key exchange, ed25519, keyring storage).
 */
export async function loginWithApiKey(): Promise<WalletStatus> {
    const apiKey = process.env.OKX_API_KEY
    const secretKey = process.env.OKX_SECRET_KEY
    const passphrase = process.env.OKX_PASSPHRASE
    if (!apiKey || !secretKey || !passphrase) {
        throw new Error(
            'Missing env vars for API key login:\n' +
            '  OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE\n' +
            'Get these from the OKX developer portal.'
        )
    }

    // `onchainos wallet login` without email triggers AK login
    const result = await runCli(['wallet', 'login', '--force'], 30_000)
    if (!result.ok) {
        throw new Error(`Login failed: ${result.errorMsg || result.raw}`)
    }

    // Verify we're now logged in
    return getWalletStatus()
}

/**
 * Check if CLI binary is installed.
 */
export function isCliInstalled(): boolean {
    return findCli() !== null
}
