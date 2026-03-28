/**
 * Header — Top bar with breadcrumb navigation and wallet status.
 *
 * Breadcrumb format: ⚡ DukerNews > Top Posts
 */

import React from 'react'
import { Box, Text } from 'ink'
import { truncAddr } from '../utils/format.js'

interface HeaderProps {
    breadcrumb: string
    walletAddress: string | null
    accountName: string | null
}

export function Header({ breadcrumb, walletAddress, accountName }: HeaderProps) {
    return (
        <Box flexDirection="row" justifyContent="space-between" paddingX={1}>
            <Text>
                <Text bold color="yellow">⚡ DukerNews</Text>
                <Text dimColor> › </Text>
                <Text bold color="white">{breadcrumb}</Text>
            </Text>
            <Box gap={1}>
                {walletAddress ? (
                    <>
                        <Text color="green">●</Text>
                        <Text dimColor>{accountName ?? 'wallet'}</Text>
                        <Text color="cyan">{truncAddr(walletAddress)}</Text>
                    </>
                ) : (
                    <Text color="red">● not connected</Text>
                )}
            </Box>
        </Box>
    )
}
