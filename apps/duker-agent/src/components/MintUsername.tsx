/**
 * MintUsername — Interactive form to mint a DukerNews username NFT.
 * User configures: username, USDT amount, and DUKI treasury split.
 * Uses OnchainOS REST API for contract calls.
 */

import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import { contractCall } from '../services/onchainos-cli-wrapper.js'
import { config } from '../utils/config.js'
import { encodeFunctionData, erc20Abi } from 'viem'
import { dukerNewsAbi } from '@alm/dukernews-dao-contract'

interface MintUsernameProps {
    walletAddress: string | null
    onDone: (username: string) => void
    onBack: () => void
    onStatusMessage: (msg: string) => void
}

type Step = 'name' | 'amount' | 'split' | 'confirm' | 'minting' | 'done'

const X_LAYER_CHAIN = '196'

export function MintUsername({ walletAddress, onDone, onBack, onStatusMessage }: MintUsernameProps) {
    const [step, setStep] = useState<Step>('name')
    const [username, setUsername] = useState('')
    const [amountStr, setAmountStr] = useState(String(config.mintFeeUsdt))
    const [bpsStr, setBpsStr] = useState(String(config.dukiBps / 100))  // show as %
    const [error, setError] = useState('')

    const amountUsdt = Number(amountStr) || 0
    const bpsPercent = Number(bpsStr) || 75
    const dukiBps = Math.min(99, Math.max(50, bpsPercent)) * 100  // clamp 50-99%, to bps
    const amountMicro = BigInt(Math.round(amountUsdt * 1_000_000))

    useInput((input, key) => {
        if (key.escape && step !== 'minting') { onBack(); return }

        if (step === 'confirm') {
            if (input === 'y' || input === 'Y') handleMint()
            else if (input === 'n' || input === 'N') setStep('name')
        }
    })

    function handleNameSubmit() {
        const name = username.trim()
        if (name.length < 1) { setError('Username must be at least 1 character'); return }
        if (new TextEncoder().encode(name).length > 192) { setError('Too long (max 192 bytes)'); return }
        setError('')
        setStep('amount')
    }

    function handleAmountSubmit() {
        if (amountUsdt < 1) { setError('Minimum 1 USDT'); return }
        setError('')
        setStep('split')
    }

    function handleSplitSubmit() {
        if (bpsPercent < 50 || bpsPercent > 99) { setError('Must be 50–99%'); return }
        setError('')
        setStep('confirm')
    }

    async function handleMint() {
        if (!walletAddress || !config.dukerNewsContract) {
            onStatusMessage('⚠ Wallet not connected or contract not configured')
            return
        }
        setStep('minting')

        try {
            // 1. Approve USDT
            onStatusMessage('Approving USDT...')
            const approveData = encodeFunctionData({
                abi: erc20Abi,
                functionName: 'approve',
                args: [config.dukerNewsContract as `0x${string}`, amountMicro],
            })
            await contractCall({
                to: config.usdtContract,
                chain: X_LAYER_CHAIN,
                inputData: approveData,
            })

            // 2. Mint username
            onStatusMessage('Minting username NFT...')
            const mintData = encodeFunctionData({
                abi: dukerNewsAbi,
                functionName: 'mintUsername',
                args: [username.trim(), amountMicro, BigInt(dukiBps)],
            })
            const result = await contractCall({
                to: config.dukerNewsContract,
                chain: X_LAYER_CHAIN,
                inputData: mintData,
            })

            onStatusMessage(`✅ "@${username.trim()}" minted! tx: ${result.txHash}`)
            setStep('done')
            setTimeout(() => onDone(username.trim()), 1500)
        } catch (err: any) {
            setError(err.message)
            setStep('name')
        }
    }

    return (
        <Box flexDirection="column" paddingX={1} paddingY={1}>
            <Text bold color="magenta">🎫 Mint Username NFT</Text>
            <Text dimColor>Register a soulbound username to post, comment, and upvote.</Text>
            <Text> </Text>

            {/* Step 1: Username */}
            {step === 'name' && (
                <Box flexDirection="column">
                    <Box>
                        <Text color="cyan">Username: </Text>
                        <TextInput value={username} onChange={setUsername} onSubmit={handleNameSubmit} placeholder="your-name" />
                    </Box>
                    {error && <Text color="red">❌ {error}</Text>}
                    <Text dimColor>Enter to continue · Esc to cancel</Text>
                </Box>
            )}

            {/* Step 2: Amount */}
            {step === 'amount' && (
                <Box flexDirection="column">
                    <Text dimColor>Username: <Text color="yellow">@{username.trim()}</Text></Text>
                    <Box>
                        <Text color="cyan">USDT amount (min 1): </Text>
                        <TextInput value={amountStr} onChange={setAmountStr} onSubmit={handleAmountSubmit} placeholder="1" />
                    </Box>
                    {error && <Text color="red">❌ {error}</Text>}
                    <Text dimColor>How much USDT to pay for minting</Text>
                </Box>
            )}

            {/* Step 3: Split */}
            {step === 'split' && (
                <Box flexDirection="column">
                    <Text dimColor>Username: <Text color="yellow">@{username.trim()}</Text> · Amount: <Text color="green">{amountUsdt} USDT</Text></Text>
                    <Box>
                        <Text color="cyan">DUKI Treasury % (50–99): </Text>
                        <TextInput value={bpsStr} onChange={setBpsStr} onSubmit={handleSplitSubmit} placeholder="75" />
                    </Box>
                    {error && <Text color="red">❌ {error}</Text>}
                    <Text dimColor>Remainder goes to DukerNews platform</Text>
                </Box>
            )}

            {/* Step 4: Confirm */}
            {step === 'confirm' && (
                <Box flexDirection="column">
                    <Text bold>Mint Summary:</Text>
                    <Text>  Username:  <Text bold color="yellow">@{username.trim()}</Text></Text>
                    <Text>  Payment:   <Text color="green">{amountUsdt} USDT</Text></Text>
                    <Text>  Split:     <Text color="magenta">{dukiBps / 100}%</Text> → DUKI Treasury · <Text color="blue">{100 - dukiBps / 100}%</Text> → DukerNews</Text>
                    <Text> </Text>
                    <Text dimColor>y: confirm · n: edit · Esc: cancel</Text>
                </Box>
            )}

            {step === 'minting' && <Text color="yellow">⏳ Minting on X Layer...</Text>}
            {step === 'done' && <Text color="green">✅ Welcome, <Text bold>@{username.trim()}</Text>!</Text>}
        </Box>
    )
}
