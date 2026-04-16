/**
 * PostDetail — View a single post with its comments tree.
 * Supports upvoting via OnchainOS REST API (contract-call).
 */

import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { queryClient } from '../services/rpc-client.js'
import { contractCall } from '../services/onchainos-cli-wrapper.js'
import { timeAgo, fmtUsdt, truncAddr, ellipsis } from '../utils/format.js'
import { config } from '../utils/config.js'
import type { PbPost, PbComment } from '@repo/apidefs'
import { encodeFunctionData, keccak256, toHex, erc20Abi } from 'viem'
import { dukerNewsAbi } from '@alm/dukernews-dao-contract'

interface PostDetailProps {
    postId: bigint
    walletAddress: string | null
    onBack: () => void
    onStatusMessage: (msg: string) => void
}

const UPVOTE_USDT = 1_000_000n // 1 USDT in micro-units
const X_LAYER_CHAIN = '196'

export function PostDetail({ postId, walletAddress, onBack, onStatusMessage }: PostDetailProps) {
    const [post, setPost] = useState<PbPost | null>(null)
    const [comments, setComments] = useState<PbComment[]>([])
    const [loading, setLoading] = useState(true)
    const [upvoting, setUpvoting] = useState(false)
    const [commentCursor, setCommentCursor] = useState(0)

    async function fetchDetail() {
        setLoading(true)
        try {
            const resp = await queryClient.getPostAgg({
                id: postId,
                commentLimit: 50,
            })
            if (resp.post) setPost(resp.post)
            setComments(resp.comments)
            setCommentCursor(0)
        } catch (err: any) {
            onStatusMessage(`Error: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchDetail() }, [postId])

    async function handleUpvote() {
        if (!walletAddress || !config.dukerNewsContract) {
            onStatusMessage('⚠ Wallet not connected or contract not configured')
            return
        }
        setUpvoting(true)

        try {
            // 1. Approve USDT
            onStatusMessage('Approving USDT...')
            const approveData = encodeFunctionData({
                abi: erc20Abi,
                functionName: 'approve',
                args: [config.dukerNewsContract as `0x${string}`, UPVOTE_USDT],
            })
            await contractCall({
                to: config.usdtContract,
                chain: X_LAYER_CHAIN,
                inputData: approveData,
            })

            // 2. Submit upvote via submitPostViaX402
            onStatusMessage('Broadcasting upvote...')
            const nonce = keccak256(toHex(`upvote:${walletAddress}:${Date.now()}`)) as `0x${string}`
            const submitData = encodeFunctionData({
                abi: dukerNewsAbi,
                functionName: 'submitPostViaX402',
                args: [
                    walletAddress as `0x${string}`,
                    2,                // aggType: AGG_TYPE_POST (uint8)
                    postId,           // aggId: existing post (uint64)
                    2,                // evtType: POST_UPVOTED (uint8)
                    '0x' as `0x${string}`, // empty data
                    UPVOTE_USDT,      // amount (uint128)
                    nonce,            // paymentNonce (bytes32)
                ],
            })
            const result = await contractCall({
                to: config.dukerNewsContract,
                chain: X_LAYER_CHAIN,
                inputData: submitData,
            })

            onStatusMessage(`✅ Upvoted! tx: ${result.txHash}`)
            setTimeout(() => fetchDetail(), 2000)
        } catch (err: any) {
            onStatusMessage(`❌ ${err.message}`)
        } finally {
            setUpvoting(false)
        }
    }

    useInput((input, key) => {
        if (key.escape || input === 'b') { onBack(); return }
        if (input === 'u' && !upvoting) { handleUpvote(); return }
        if (key.upArrow && commentCursor > 0) {
            setCommentCursor(c => c - 1)
        }
        if (key.downArrow && commentCursor < comments.length - 1) {
            setCommentCursor(c => c + 1)
        }
    })

    if (loading) {
        return (
            <Box paddingX={1} paddingY={1}>
                <Text color="yellow">⏳ Loading post...</Text>
            </Box>
        )
    }

    if (!post) {
        return (
            <Box paddingX={1}>
                <Text color="red">Post not found.</Text>
            </Box>
        )
    }

    return (
        <Box flexDirection="column" paddingX={1}>
            {/* Post header */}
            <Box flexDirection="column" marginBottom={1}>
                <Text bold color="yellow">{post.title || '(untitled)'}</Text>
                {post.url && <Text color="cyan" dimColor>{post.url}</Text>}
                <Box gap={2}>
                    <Text color="green" bold>{post.points} pts</Text>
                    {Number(post.totalBoost) > 0 && (
                        <Text color="magenta">💰 {fmtUsdt(post.totalBoost)} USDT boosted</Text>
                    )}
                    <Text dimColor>by {post.username || truncAddr(post.address)} · {timeAgo(post.createdAt)}</Text>
                </Box>
                {post.text && (
                    <Box marginTop={1}>
                        <Text>{post.text}</Text>
                    </Box>
                )}
            </Box>

            {/* Divider */}
            <Text dimColor>{'─'.repeat(60)}</Text>

            {/* Comments */}
            <Box marginTop={1} marginBottom={1}>
                <Text bold>{comments.length} Comment{comments.length !== 1 ? 's' : ''}</Text>
            </Box>

            {comments.length === 0 ? (
                <Text dimColor>No comments yet.</Text>
            ) : (
                comments.map((c, i) => {
                    const indent = '  '.repeat(c.depth)
                    const selected = i === commentCursor

                    return (
                        <Box key={Number(c.id)} flexDirection="column" marginBottom={0}>
                            <Text>
                                <Text color={selected ? 'yellow' : 'white'}>{selected ? '▸' : ' '}</Text>
                                <Text dimColor>{indent}</Text>
                                <Text color="cyan" bold>{c.username || '??'}</Text>
                                <Text dimColor> · {timeAgo(c.createdAt)}</Text>
                                {c.points > 0 && <Text color="green"> [{c.points} pts]</Text>}
                                {Number(c.totalBoost) > 0 && <Text color="magenta"> 💰{fmtUsdt(c.totalBoost)}</Text>}
                            </Text>
                            <Text>
                                <Text> </Text>
                                <Text dimColor>{indent}</Text>
                                <Text>{ellipsis(c.text, 70 - c.depth * 2)}</Text>
                            </Text>
                        </Box>
                    )
                })
            )}
        </Box>
    )
}
