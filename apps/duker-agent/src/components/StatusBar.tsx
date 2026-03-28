/**
 * StatusBar — Bottom bar with dynamic keyboard shortcuts.
 * Shortcuts change based on the current view and user context.
 */

import React from 'react'
import { Box, Text } from 'ink'

interface StatusBarProps {
    shortcuts: string
    message?: string
}

export function StatusBar({ shortcuts, message }: StatusBarProps) {
    return (
        <Box flexDirection="row" justifyContent="space-between" paddingX={1} marginTop={1}>
            <Text dimColor>{shortcuts}</Text>
            {message && <Text color="yellow">{message}</Text>}
        </Box>
    )
}
