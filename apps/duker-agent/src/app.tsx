/**
 * App — Main application component with view routing.
 *
 * Features:
 *   - Breadcrumb navigation: ⚡ DukerNews › [page]
 *   - Dynamic, context-aware keyboard shortcuts
 *   - Auto-login via API key on startup
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Box, useStdout } from 'ink'
import { Header } from './components/Header.js'
import { PostList } from './components/PostList.js'
import { PostDetail } from './components/PostDetail.js'
import { MintUsername } from './components/MintUsername.js'
import { WalletView } from './components/WalletView.js'
import { StatusBar } from './components/StatusBar.js'
import {
    getWalletStatus,
    loginWithApiKey,
    isCliInstalled,
} from './services/onchainos-cli-wrapper.js'

type View =
    | { name: 'home' }
    | { name: 'detail'; postId: bigint }
    | { name: 'mint' }
    | { name: 'wallet' }

export function App() {
    const [view, setView] = useState<View>({ name: 'home' })
    const [statusMsg, setStatusMsg] = useState('')
    const [walletAddress, setWalletAddress] = useState<string | null>(null)
    const [accountName, setAccountName] = useState<string | null>(null)
    const [hasUsername, setHasUsername] = useState(false)
    const [pageInfo, setPageInfo] = useState({ page: 1, total: 0, hasMore: false })
    const [walletLoggedIn, setWalletLoggedIn] = useState(false)
    const { write } = useStdout()

    // Clear ghost lines on view switch
    const navigateTo = useCallback((v: View) => {
        write('\x1B[J')
        setView(v)
    }, [write])

    // Auto-login on startup
    useEffect(() => {
        async function initWallet() {
            if (!isCliInstalled()) {
                setStatusMsg('⚠ onchainos CLI not found')
                return
            }

            let status = await getWalletStatus()
            if (status.loggedIn) {
                setWalletAddress(status.address)
                setAccountName(status.accountName)
                setWalletLoggedIn(true)
                setStatusMsg('✅ Connected')
                return
            }

            if (process.env.OKX_API_KEY) {
                setStatusMsg('🔑 Logging in...')
                try {
                    status = await loginWithApiKey()
                    if (status.loggedIn) {
                        setWalletAddress(status.address)
                        setAccountName(status.accountName)
                        setWalletLoggedIn(true)
                        setStatusMsg('✅ Connected')
                    }
                } catch (err: any) {
                    setStatusMsg(`❌ ${err.message}`)
                }
            } else {
                setStatusMsg('Press w to open wallet & login')
            }
        }
        initWallet()
    }, [])

    // Breadcrumb for current view
    const breadcrumb = useMemo(() => {
        switch (view.name) {
            case 'home': return 'Top Posts'
            case 'detail': return 'Post'
            case 'mint': return 'Mint Username'
            case 'wallet': return 'Wallet'
            default: return ''
        }
    }, [view.name])

    // Dynamic, context-aware shortcuts
    const shortcuts = useMemo(() => {
        const parts: string[] = []

        switch (view.name) {
            case 'home':
                parts.push('↑↓:nav', 'Enter:open')
                if (!hasUsername) parts.push('m:mint')
                parts.push('w:wallet', 'r:refresh')
                if (pageInfo.hasMore) parts.push('n:next')
                if (pageInfo.page > 1) parts.push('p:prev')
                parts.push('q:quit')
                break

            case 'detail':
                parts.push('Esc:back', '↑↓:scroll')
                if (walletLoggedIn) parts.push('u:upvote')
                break

            case 'mint':
                parts.push('Esc:cancel', 'Enter:next')
                break

            case 'wallet':
                parts.push('Esc:back', 'r:refresh')
                if (!walletLoggedIn) parts.push('l:login')
                break
        }

        return parts.join('  ')
    }, [view.name, hasUsername, walletLoggedIn, pageInfo])

    return (
        <Box flexDirection="column">
            <Header
                breadcrumb={breadcrumb}
                walletAddress={walletAddress}
                accountName={accountName}
            />

            {view.name === 'home' && (
                <PostList
                    onSelectPost={(postId) => navigateTo({ name: 'detail', postId })}
                    onMint={() => navigateTo({ name: 'mint' })}
                    onWallet={() => navigateTo({ name: 'wallet' })}
                    onQuit={() => process.exit(0)}
                    onStatusMessage={setStatusMsg}
                    onPageInfo={(page, total, hasMore) =>
                        setPageInfo({ page, total, hasMore })
                    }
                />
            )}

            {view.name === 'detail' && (
                <PostDetail
                    postId={view.postId}
                    walletAddress={walletAddress}
                    onBack={() => navigateTo({ name: 'home' })}
                    onStatusMessage={setStatusMsg}
                />
            )}

            {view.name === 'mint' && (
                <MintUsername
                    walletAddress={walletAddress}
                    onDone={(username) => {
                        setAccountName(username)
                        setHasUsername(true)
                        navigateTo({ name: 'home' })
                    }}
                    onBack={() => navigateTo({ name: 'home' })}
                    onStatusMessage={setStatusMsg}
                />
            )}

            {view.name === 'wallet' && (
                <WalletView
                    walletAddress={walletAddress}
                    accountName={accountName}
                    onBack={() => navigateTo({ name: 'home' })}
                    onStatusMessage={setStatusMsg}
                    onWalletConnected={(addr, name) => {
                        setWalletAddress(addr)
                        setAccountName(name)
                        setWalletLoggedIn(true)
                    }}
                />
            )}

            <StatusBar shortcuts={shortcuts} message={statusMsg} />
        </Box>
    )
}
