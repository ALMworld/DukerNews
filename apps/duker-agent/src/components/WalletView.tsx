/**
 * WalletView — Display wallet info, balances, and account details.
 * Fetches data from OnchainOS CLI.
 */

import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import {
    getWalletStatus,
    getBalances,
    getAddresses,
    loginWithApiKey,
    isCliInstalled,
    type WalletStatus,
    type TokenBalance,
    type WalletAddresses,
} from '../services/onchainos-cli-wrapper.js'
import { truncAddr } from '../utils/format.js'

interface WalletViewProps {
    walletAddress: string | null
    accountName: string | null
    onBack: () => void
    onStatusMessage: (msg: string) => void
    onWalletConnected: (address: string, name: string | null) => void
}

export function WalletView({
    walletAddress,
    accountName,
    onBack,
    onStatusMessage,
    onWalletConnected,
}: WalletViewProps) {
    const [status, setStatus] = useState<WalletStatus | null>(null)
    const [addresses, setAddresses] = useState<WalletAddresses | null>(null)
    const [totalUsd, setTotalUsd] = useState('0.00')
    const [tokens, setTokens] = useState<TokenBalance[]>([])
    const [loading, setLoading] = useState(true)
    const [loggingIn, setLoggingIn] = useState(false)

    async function refresh() {
        setLoading(true)
        onStatusMessage('Loading wallet...')
        try {
            const s = await getWalletStatus()
            setStatus(s)

            if (s.loggedIn) {
                // Fetch addresses
                try {
                    const addrs = await getAddresses()
                    setAddresses(addrs)
                } catch { /* ok */ }

                // Fetch balances
                try {
                    const bal = await getBalances()
                    setTotalUsd(bal.totalValueUsd)
                    setTokens(bal.tokens)
                } catch { /* ok */ }

                onStatusMessage('')
            } else {
                onStatusMessage('')
            }
        } catch (err: any) {
            onStatusMessage(`Error: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { refresh() }, [])

    async function handleLogin() {
        if (!isCliInstalled()) {
            onStatusMessage('⚠ onchainos CLI not installed')
            return
        }
        if (!process.env.OKX_API_KEY) {
            onStatusMessage('⚠ Set OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE in .env')
            return
        }

        setLoggingIn(true)
        onStatusMessage('🔑 Logging in...')
        try {
            const s = await loginWithApiKey()
            setStatus(s)
            if (s.loggedIn && s.address) {
                onWalletConnected(s.address, s.accountName)
            }
            // Refresh everything
            await refresh()
            onStatusMessage('✅ Connected!')
        } catch (err: any) {
            onStatusMessage(`❌ Login failed: ${err.message}`)
        } finally {
            setLoggingIn(false)
        }
    }

    useInput((input, key) => {
        if (key.escape || input === 'b') { onBack(); return }
        if (input === 'r') { refresh(); return }
        if (input === 'l' && !status?.loggedIn && !loggingIn) { handleLogin(); return }
    })

    if (loading) {
        return (
            <Box paddingX={1} paddingY={1}>
                <Text color="yellow">⏳ Loading wallet info...</Text>
            </Box>
        )
    }

    const cliInstalled = isCliInstalled()

    return (
        <Box flexDirection="column" paddingX={1} paddingY={1}>
            <Text dimColor>{'─'.repeat(55)}</Text>

            {/* CLI Status */}
            <Box marginTop={1}>
                <Text dimColor>{'CLI:'.padEnd(12)}</Text>
                {cliInstalled
                    ? <Text color="green">✅ onchainos installed</Text>
                    : <Text color="red">❌ not installed</Text>
                }
            </Box>

            {/* Connection Status */}
            <Box>
                <Text dimColor>{'Status:'.padEnd(12)}</Text>
                {status?.loggedIn
                    ? <Text color="green">● Connected ({status.loginType || 'unknown'})</Text>
                    : <Text color="red">● Not connected</Text>
                }
            </Box>

            {/* Account Info */}
            {status?.loggedIn && (
                <>
                    <Box>
                        <Text dimColor>{'Account:'.padEnd(12)}</Text>
                        <Text color="cyan">{status.accountName || accountName || '(unnamed)'}</Text>
                    </Box>
                    {status.accountId && (
                        <Box>
                            <Text dimColor>{'ID:'.padEnd(12)}</Text>
                            <Text dimColor>{status.accountId}</Text>
                        </Box>
                    )}
                </>
            )}

            {/* Addresses */}
            {status?.loggedIn && addresses && (
                <Box flexDirection="column" marginTop={1}>
                    <Text bold>Addresses</Text>
                    <Text dimColor>{'─'.repeat(55)}</Text>
                    {addresses.xlayer.length > 0 && (
                        <Box>
                            <Text color="yellow" bold>{'  X Layer:'.padEnd(14)}</Text>
                            <Text color="cyan">{addresses.xlayer[0]!.address}</Text>
                        </Box>
                    )}
                    {addresses.evm.length > 0 && (
                        <Box>
                            <Text color="green" bold>{'  EVM:'.padEnd(14)}</Text>
                            <Text color="cyan">{addresses.evm[0]!.address}</Text>
                            <Text dimColor> ({addresses.evm.length} chains)</Text>
                        </Box>
                    )}
                    {addresses.solana.length > 0 && (
                        <Box>
                            <Text color="magenta" bold>{'  Solana:'.padEnd(14)}</Text>
                            <Text color="cyan">{addresses.solana[0]!.address}</Text>
                        </Box>
                    )}
                </Box>
            )}

            {/* Balances */}
            {status?.loggedIn && (
                <Box flexDirection="column" marginTop={1}>
                    <Box>
                        <Text bold>Balances</Text>
                        <Text dimColor>  (total: ${totalUsd})</Text>
                    </Box>
                    <Text dimColor>{'─'.repeat(55)}</Text>
                    {tokens.length === 0 ? (
                        <Text dimColor>  No token balances found.</Text>
                    ) : (
                        tokens.map((t, i) => (
                            <Box key={i} gap={1}>
                                <Text>  </Text>
                                <Text color="cyan" bold>{(t.symbol).padEnd(10)}</Text>
                                <Text color="green">{t.balance}</Text>
                                {t.tokenAddress && (
                                    <Text dimColor> [{truncAddr(t.tokenAddress)}]</Text>
                                )}
                            </Box>
                        ))
                    )}
                </Box>
            )}

            {/* Login Prompt */}
            {!status?.loggedIn && (
                <Box marginTop={1} flexDirection="column">
                    <Text dimColor>{'─'.repeat(55)}</Text>
                    {loggingIn ? (
                        <Text color="yellow">⏳ Logging in with API key...</Text>
                    ) : process.env.OKX_API_KEY ? (
                        <Text>Press <Text bold color="cyan">l</Text> to login with API key</Text>
                    ) : (
                        <Box flexDirection="column">
                            <Text color="red">⚠ No API key configured</Text>
                            <Text dimColor>Add to .env: OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE</Text>
                        </Box>
                    )}
                </Box>
            )}
        </Box>
    )
}
