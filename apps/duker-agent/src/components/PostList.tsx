/**
 * PostList — Browse posts with arrow-key navigation.
 * Fetches posts via ConnectRPC QueryService.getPosts().
 */

import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { queryClient } from '../services/rpc-client.js'
import { ellipsis, timeAgo, fmtUsdt } from '../utils/format.js'
import type { PbPost } from '@repo/dukernews-apidefs'

interface PostListProps {
    onSelectPost: (postId: bigint) => void
    onMint: () => void
    onWallet: () => void
    onQuit: () => void
    onStatusMessage: (msg: string) => void
    onPageInfo: (page: number, total: number, hasMore: boolean) => void
}

export function PostList({ onSelectPost, onMint, onWallet, onQuit, onStatusMessage, onPageInfo }: PostListProps) {
    const [posts, setPosts] = useState<PbPost[]>([])
    const [cursor, setCursor] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)

    const perPage = 15

    async function fetchPosts(p: number) {
        setLoading(true)
        onStatusMessage('Loading posts...')
        try {
            const resp = await queryClient.getPosts({
                page: p,
                perPage,
                sort: 'points',
            })
            setPosts(resp.posts)
            setTotal(resp.total)
            setCursor(0)
            onPageInfo(p, resp.total, resp.posts.length === perPage)
            onStatusMessage('')
        } catch (err: any) {
            onStatusMessage(`Error: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchPosts(page) }, [page])

    useInput((input, key) => {
        if (input === 'q') { onQuit(); return }
        if (input === 'r') { fetchPosts(page); return }
        if (input === 'm') { onMint(); return }
        if (input === 'w') { onWallet(); return }

        if (key.upArrow && cursor > 0) {
            setCursor(c => c - 1)
        }
        if (key.downArrow && cursor < posts.length - 1) {
            setCursor(c => c + 1)
        }
        if (key.return && posts[cursor]) {
            onSelectPost(posts[cursor]!.id)
        }
        // Pagination
        if (input === 'n' && posts.length === perPage) {
            setPage(p => p + 1)
        }
        if (input === 'p' && page > 1) {
            setPage(p => p - 1)
        }
    })

    if (loading && posts.length === 0) {
        return (
            <Box paddingX={1} paddingY={1}>
                <Text color="yellow">⏳ Loading posts...</Text>
            </Box>
        )
    }

    return (
        <Box flexDirection="column" paddingX={1}>
            {posts.map((post, i) => {
                const selected = i === cursor
                const pointsStr = String(post.points).padStart(3, ' ')
                const boostStr = Number(post.totalBoost) > 0
                    ? ` 💰${fmtUsdt(post.totalBoost)}`
                    : ''

                return (
                    <Box key={Number(post.id)} flexDirection="row" gap={1}>
                        <Text color={selected ? 'yellow' : 'white'}>
                            {selected ? '▸' : ' '}
                        </Text>
                        <Text color="green" bold>{pointsStr}</Text>
                        <Text color={selected ? 'yellow' : 'white'} bold={selected}>
                            {ellipsis(post.title || post.text || '(untitled)', 55)}
                        </Text>
                        <Text dimColor>
                            {post.username || '??'} · {timeAgo(post.createdAt)}{boostStr}
                        </Text>
                        {post.commentCount > 0 && (
                            <Text color="cyan">[{post.commentCount}💬]</Text>
                        )}
                    </Box>
                )
            })}

            {posts.length === 0 && !loading && (
                <Text color="gray">No posts found.</Text>
            )}
        </Box>
    )
}
