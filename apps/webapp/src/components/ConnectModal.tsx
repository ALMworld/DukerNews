/**
 * 2-step ConnectModal — wallet connect then SIWE sign-in.
 * Theme-context aware (respects light/dark via CSS vars).
 * Client-only component.
 */
import { useAccount, useChainId, useDisconnect, useSignMessage, useConnect, useConnectors, useSwitchChain } from 'wagmi'
import { useCallback, useEffect, useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { SiweMessage } from 'siwe'
import { useAuthStore } from '../lib/authStore'
import { authApi } from '../lib/authService'
import { queryKeys } from '../client'
import { DEFAULT_CHAIN_ID } from '../lib/contracts'
import * as m from '../paraglide/messages.js'
import type { Connector } from 'wagmi'

const domain = typeof window !== 'undefined' ? window.location.host : 'localhost'
const uri = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'

/* ═══ Inline SVG icons (no lucide dependency needed) ═══ */

function CheckIcon({ className }: { className?: string }) {
    return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
    )
}

function PenIcon({ className }: { className?: string }) {
    return (
        <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
    )
}

function SpinnerIcon({ className }: { className?: string }) {
    return (
        <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ animation: 'spin 1s linear infinite' }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    )
}

function CloseIcon({ className }: { className?: string }) {
    return (
        <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    )
}

function LogOutIcon({ className }: { className?: string }) {
    return (
        <svg className={className} width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
    )
}

function WalletConnectLogo({ className }: { className?: string }) {
    return (
        <svg className={className} width="24" height="24" viewBox="0 0 300 185" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M61.4385 36.2562C104.397 -5.42044 174.144 -5.42044 217.103 36.2562L222.239 41.2194C224.456 43.3728 224.456 46.8727 222.239 49.026L203.891 66.7759C202.783 67.8526 201.004 67.8526 199.896 66.7759L192.763 59.8625C163.064 31.0115 115.477 31.0115 85.7781 59.8625L78.1109 67.3044C77.0022 68.3811 75.2237 68.3811 74.115 67.3044L55.7678 49.5546C53.5501 47.4012 53.5501 43.9013 55.7678 41.7479L61.4385 36.2562ZM253.996 71.9756L270.345 87.7888C272.563 89.9422 272.563 93.4421 270.345 95.5955L196.66 166.816C194.443 168.97 190.886 168.97 188.668 166.816L134.999 114.944C134.445 114.406 133.555 114.406 133.001 114.944L79.3321 166.816C77.1145 168.97 73.5574 168.97 71.3397 166.816L-2.34473 95.5955C-4.56243 93.4421 -4.56243 89.9422 -2.34473 87.7888L13.9038 71.9756C16.1214 69.8222 19.6786 69.8222 21.8963 71.9756L75.5651 123.848C76.1189 124.386 77.0087 124.386 77.5625 123.848L131.231 71.9756C133.449 69.8222 137.006 69.8222 139.224 71.9756L192.893 123.848C193.446 124.386 194.336 124.386 194.89 123.848L248.559 71.9756C250.776 69.8222 254.213 69.8222 253.996 71.9756Z"
                fill="#3B99FC" />
        </svg>
    )
}

function LayoutGridIcon({ className, active }: { className?: string; active?: boolean }) {
    return (
        <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke={active ? '#fff' : 'var(--accent)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
    )
}

/* ═══ ConnectModal ═══ */

export function ConnectModal() {
    const { isConnected, address } = useAccount()
    const chainId = useChainId()
    const { disconnect } = useDisconnect()
    const { signMessageAsync } = useSignMessage()
    const connectHook = useConnect()
    const connectors = useConnectors()
    const { switchChainAsync } = useSwitchChain()
    const { authStatus, me, setAuthStatus, setMe, setConnectModalOpen } = useAuthStore()
    const queryClient = useQueryClient()
    const navigate = useNavigate()

    const isAuthenticated = authStatus === 'authenticated'
    const needsUsername = isAuthenticated && me && !me.username
    const [isSigning, setIsSigning] = useState(false)
    const [showMore, setShowMore] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Separate WalletConnect from detected wallets
    const { wcConnector, detectedWallets } = useMemo(() => {
        const seen = new Set<string>()
        let wc: Connector | null = null
        const detected: Connector[] = []

        for (const c of connectors) {
            const key = `${c.id}-${c.name}`
            if (seen.has(key)) continue
            seen.add(key)

            if (c.id === 'walletConnect') {
                wc = c
            } else if (c.icon) {
                detected.push(c)
            }
        }

        return { wcConnector: wc, detectedWallets: detected }
    }, [connectors])

    // Auto-close on auth (only if user already has a username)
    useEffect(() => {
        if (isAuthenticated && !needsUsername) {
            setIsSigning(false)
            setConnectModalOpen(false)
        }
    }, [isAuthenticated, needsUsername, setConnectModalOpen])

    // Handle wallet reconnect — detect address mismatch
    useEffect(() => {
        if (!isConnected || !isAuthenticated || !me?.ego || !address) return
        if (address.toLowerCase() !== me.ego.toLowerCase()) {
            // Different address connected — invalidate stale auth, user must re-sign
            authApi.logout().catch(() => { /* ignore */ })
            setAuthStatus('unauthenticated')
            setMe(null)
            queryClient.setQueryData(queryKeys.authMe(), null)
        }
    }, [isConnected, isAuthenticated, address, me?.ego, setAuthStatus, setMe, queryClient])

    const close = useCallback(() => {
        setConnectModalOpen(false)
        setError(null)
        setIsSigning(false)
        setShowMore(false)
    }, [setConnectModalOpen])

    const handleDisconnect = useCallback(async () => {
        if (isConnected) disconnect()
        if (authStatus && authStatus !== 'unauthenticated') {
            try { await authApi.logout() } catch { /* ignore */ }
            setAuthStatus('unauthenticated')
            setMe(null)
            queryClient.setQueryData(queryKeys.authMe(), null)
        }
        setError(null)
        setIsSigning(false)
        setShowMore(false)
        setConnectModalOpen(false)
    }, [isConnected, disconnect, authStatus, setAuthStatus, setMe, setConnectModalOpen, queryClient])

    // Connect with a specific connector
    const handleConnectWallet = useCallback(async (connector: Connector) => {
        setError(null)
        try {
            await connectHook.connectAsync({ connector })
            // Auto-switch to home chain if wallet is on a different network
            try {
                await switchChainAsync({ chainId: DEFAULT_CHAIN_ID })
            } catch {
                // Ignore switch errors — user may reject, but connection still works
            }
        } catch (e: any) {
            const msg = e?.message || 'Connection failed'
            if (msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied')) return
            setError(msg.length > 120 ? msg.slice(0, 120) + '…' : msg)
        }
    }, [connectHook, switchChainAsync])

    // Step 2: SIWE sign-in
    const handleStep2 = useCallback(async () => {
        if (!address || isSigning) return
        setError(null)
        setIsSigning(true)
        try {
            const nonce = await authApi.getNonce()
            const siweMessage = new SiweMessage({
                domain,
                address,
                statement: 'Sign in to Duker News',
                uri,
                version: '1',
                chainId,
                nonce,
            })
            const message = siweMessage.prepareMessage()
            const signature = await signMessageAsync({ message })
            const userData = await authApi.login(message, signature)

            setIsSigning(false)
            setAuthStatus('authenticated')
            setMe(userData)
            // Update TQ cache so WalletButton doesn't re-fetch
            queryClient.setQueryData(queryKeys.authMe(), userData)

            // No username yet → modal stays open to show Step 3
        } catch (e: any) {
            const msg = e?.message || 'Sign-in failed'
            if (msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied')) {
                setIsSigning(false)
                return
            }
            setError(msg.length > 120 ? msg.slice(0, 120) + '…' : msg)
            setIsSigning(false)
        }
    }, [address, chainId, isSigning, signMessageAsync, setAuthStatus, setMe])

    const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={close}
        >
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            <div
                className="relative w-full max-w-sm md:max-w-md mx-4 rounded-2xl overflow-hidden"
                style={{
                    background: 'var(--card, #1a1c2e)',
                    border: '1px solid var(--border)',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <h3 style={{ color: 'var(--foreground)', fontSize: '16px', fontWeight: 600, margin: 0 }}>
                        Connect & Sign In
                    </h3>
                    <button
                        onClick={close}
                        style={{
                            padding: '6px', borderRadius: '8px', border: 'none',
                            background: 'transparent', cursor: 'pointer',
                            color: 'var(--muted-foreground)',
                        }}
                    >
                        <CloseIcon />
                    </button>
                </div>

                {/* Step indicator */}
                <div className="flex gap-2 px-5 pb-4">
                    <div style={{ flex: 1, height: 4, borderRadius: 4, overflow: 'hidden', background: 'var(--muted)' }}>
                        <div style={{
                            height: '100%', borderRadius: 4, transition: 'all 0.5s',
                            width: '100%',
                            background: isConnected
                                ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                                : 'linear-gradient(90deg, var(--accent), var(--primary))',
                        }} />
                    </div>
                    <div style={{ flex: 1, height: 4, borderRadius: 4, overflow: 'hidden', background: 'var(--muted)' }}>
                        <div style={{
                            height: '100%', borderRadius: 4, transition: 'all 0.5s',
                            width: (isAuthenticated && isConnected) ? '100%' : isConnected ? '50%' : isAuthenticated ? '30%' : '0%',
                            background: (isAuthenticated && isConnected)
                                ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                                : 'linear-gradient(90deg, var(--accent), var(--primary))',
                        }} />
                    </div>
                    {needsUsername && (
                        <div style={{ flex: 1, height: 4, borderRadius: 4, overflow: 'hidden', background: 'var(--muted)' }}>
                            <div style={{
                                height: '100%', borderRadius: 4, transition: 'all 0.5s',
                                width: '50%',
                                background: 'linear-gradient(90deg, var(--accent), var(--primary))',
                            }} />
                        </div>
                    )}
                </div>

                {/* Error */}
                {error && (
                    <div className="mx-5 mb-3 px-3 py-2 rounded-xl" style={{
                        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                    }}>
                        <p style={{ color: '#fca5a5', fontSize: '12px', margin: 0, lineHeight: 1.5 }}>{error}</p>
                    </div>
                )}

                {/* Steps */}
                <div className="px-5 pb-5" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                    {/* Step 1: Connect Wallet */}
                    <div>
                        <div
                            className="flex items-center gap-3 px-4 rounded-xl"
                            style={{
                                padding: '14px 16px',
                                background: isConnected ? 'rgba(34,197,94,0.06)' : 'color-mix(in srgb, var(--accent) 8%, transparent)',
                                border: isConnected
                                    ? '1px solid rgba(34,197,94,0.15)'
                                    : '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
                                cursor: !isConnected ? 'pointer' : 'default',
                            }}
                            onClick={() => {
                                if (!isConnected && wcConnector && !connectHook.isPending) {
                                    handleConnectWallet(wcConnector)
                                }
                            }}
                        >
                            <div
                                style={{
                                    width: 32, height: 32, borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0, fontSize: '14px', fontWeight: 700,
                                    background: isConnected ? 'rgba(34,197,94,0.15)' : 'var(--accent)',
                                    color: isConnected ? '#4ade80' : '#fff',
                                }}
                            >
                                {isConnected ? <CheckIcon /> : '1'}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{
                                    fontSize: '14px', fontWeight: 500, margin: 0,
                                    color: isConnected ? '#4ade80' : 'var(--foreground)',
                                }}>
                                    {isConnected ? 'Connected' : 'Connect Wallet'}
                                </p>
                                <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginTop: 2, margin: 0 }}>
                                    {isConnected ? shortAddr : 'Choose a wallet to connect'}
                                </p>
                            </div>

                            {/* Wallet action buttons */}
                            {!isConnected && (
                                <div className="flex items-center gap-1.5" style={{ flexShrink: 0 }}>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); wcConnector && handleConnectWallet(wcConnector) }}
                                        disabled={!wcConnector || connectHook.isPending}
                                        style={{
                                            width: 36, height: 36, borderRadius: 8, border: 'none',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', transition: 'all 0.2s',
                                            background: 'transparent',
                                            opacity: !wcConnector || connectHook.isPending ? 0.4 : 1,
                                        }}
                                        title="Connect via WalletConnect"
                                    >
                                        {connectHook.isPending
                                            ? <SpinnerIcon className="text-blue-400" />
                                            : <WalletConnectLogo />}
                                    </button>

                                    {detectedWallets.length > 0 && (
                                        <>
                                            {/* Show first detected wallet icon */}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleConnectWallet(detectedWallets[0]) }}
                                                disabled={connectHook.isPending}
                                                style={{
                                                    width: 36, height: 36, borderRadius: 8, border: 'none',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: 'pointer', transition: 'all 0.2s',
                                                    background: 'transparent',
                                                    opacity: connectHook.isPending ? 0.4 : 1,
                                                }}
                                                title={`Connect ${detectedWallets[0].name}`}
                                            >
                                                <img src={detectedWallets[0].icon!} alt="" style={{ width: 24, height: 24, borderRadius: 6 }} />
                                            </button>

                                            {/* Grid icon to show more wallets */}
                                            {detectedWallets.length > 1 && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setShowMore(!showMore) }}
                                                    style={{
                                                        width: 36, height: 36, borderRadius: 8, border: 'none',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer', transition: 'all 0.2s',
                                                        background: showMore ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 15%, transparent)',
                                                    }}
                                                    title={showMore ? 'Hide wallets' : `${detectedWallets.length - 1} more wallet(s)`}
                                                >
                                                    <LayoutGridIcon active={showMore} />
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Detected wallets dropdown */}
                        {!isConnected && showMore && detectedWallets.length > 0 && (
                            <div style={{ marginTop: 8, paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {detectedWallets.map((connector) => (
                                    <button
                                        key={`${connector.id}-${connector.name}`}
                                        onClick={() => handleConnectWallet(connector)}
                                        disabled={connectHook.isPending}
                                        style={{
                                            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                                            padding: '10px 12px', borderRadius: 12, textAlign: 'left',
                                            border: '1px solid var(--border)',
                                            background: 'var(--muted)',
                                            cursor: connectHook.isPending ? 'wait' : 'pointer',
                                            opacity: connectHook.isPending ? 0.5 : 1,
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        <img src={connector.icon!} alt="" style={{ width: 28, height: 28, borderRadius: 8 }} />
                                        <span style={{ fontSize: 14, color: 'var(--foreground)', fontWeight: 500, flex: 1 }}>
                                            {connector.name}
                                        </span>
                                        {connectHook.isPending && <SpinnerIcon />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Step 2: Sign In */}
                    {(() => {
                        // Step 2 is only "done" visually if BOTH authenticated AND wallet connected
                        const step2Done = isAuthenticated && isConnected
                        // Auth exists but wallet dropped — show as needing reconnect
                        const needsReconnect = isAuthenticated && !isConnected
                        return (
                            <button
                                onClick={handleStep2}
                                disabled={!isConnected || isAuthenticated || isSigning}
                                style={{
                                    width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                                    padding: '14px 16px', borderRadius: 12,
                                    border: step2Done
                                        ? '1px solid rgba(34,197,94,0.15)'
                                        : isConnected
                                            ? '1px solid color-mix(in srgb, var(--accent) 20%, transparent)'
                                            : '1px solid var(--border)',
                                    background: step2Done
                                        ? 'rgba(34,197,94,0.06)'
                                        : isConnected
                                            ? 'color-mix(in srgb, var(--accent) 8%, transparent)'
                                            : 'var(--muted)',
                                    cursor: !isConnected || isAuthenticated || isSigning ? 'default' : 'pointer',
                                    opacity: !isConnected && !isAuthenticated ? 0.4 : 1,
                                    transition: 'all 0.2s',
                                }}
                            >
                                <div
                                    style={{
                                        width: 32, height: 32, borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0, fontSize: '14px', fontWeight: 700,
                                        background: step2Done
                                            ? 'rgba(34,197,94,0.15)'
                                            : isConnected ? 'var(--accent)' : 'var(--muted)',
                                        color: step2Done ? '#4ade80' : isConnected ? '#fff' : 'var(--muted-foreground)',
                                    }}
                                >
                                    {step2Done ? <CheckIcon /> : '2'}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{
                                        fontSize: '14px', fontWeight: 500, margin: 0,
                                        color: step2Done ? '#4ade80' : isConnected ? 'var(--foreground)' : 'var(--muted-foreground)',
                                    }}>
                                        Sign In
                                    </p>
                                    <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginTop: 2, margin: 0 }}>
                                        {step2Done
                                            ? 'Signed in ✓'
                                            : needsReconnect
                                                ? 'Reconnect wallet to continue'
                                                : isSigning
                                                    ? 'Waiting for signature…'
                                                    : isConnected
                                                        ? 'Sign a message to verify ownership'
                                                        : 'Connect wallet first'}
                                    </p>
                                </div>
                                {isSigning && <SpinnerIcon />}
                                {isConnected && !isAuthenticated && !isSigning && <PenIcon />}
                            </button>
                        )
                    })()}

                    {/* Step 3: Mint Username (only for first-time users) */}
                    {needsUsername && (
                        <button
                            onClick={() => {
                                setConnectModalOpen(false)
                                navigate({ to: '/welcome' })
                            }}
                            style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                                padding: '14px 16px', borderRadius: 12,
                                border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
                                background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                        >
                            <div
                                style={{
                                    width: 32, height: 32, borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0, fontSize: '14px', fontWeight: 700,
                                    background: 'var(--accent)',
                                    color: '#fff',
                                }}
                            >
                                3
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{
                                    fontSize: '14px', fontWeight: 500, margin: 0,
                                    color: 'var(--foreground)',
                                }}>
                                    {m.connect_step3_title()}
                                </p>
                                <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginTop: 2, margin: 0 }}>
                                    {m.connect_step3_desc()}
                                </p>
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontWeight: 500 }}>{m.connect_step3_badge()}</span>
                        </button>
                    )}

                    {/* Disconnect link */}
                    {isConnected && !isAuthenticated && !isSigning && (
                        <button
                            onClick={handleDisconnect}
                            style={{
                                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                paddingTop: 8, paddingBottom: 4, fontSize: 12, border: 'none', background: 'none',
                                color: 'var(--muted-foreground)', cursor: 'pointer',
                            }}
                        >
                            <LogOutIcon />
                            Disconnect wallet
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
