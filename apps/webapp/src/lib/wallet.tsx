import { useEffect } from 'react'
import { User, LogOut, CreditCard } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from './authStore'
import { authApi } from './authService'
import { queryKeys } from '../client'

/**
 * Auth-aware wallet button.
 * - Unauthenticated: shows "Connect" → opens ConnectModal
 * - Authenticated: shows shortened address → links to profile, with logout
 * Uses TanStack Query to cache the /me check — only re-fetches on mount + stale.
 */
export default function WalletButton() {
    const { authStatus, me, setAuthStatus, setMe, setConnectModalOpen } = useAuthStore()
    const queryClient = useQueryClient()

    // TanStack Query: verify session from cookie, cached after first success.
    // staleTime = Infinity so it won't re-fetch unless explicitly invalidated
    // (e.g. after login/logout). refetchOnMount = 'always' ensures the first
    // render of the app always verifies the cookie.
    const { data: sessionUser, isLoading } = useQuery({
        queryKey: queryKeys.authMe(),
        queryFn: () => authApi.me(),
        staleTime: Infinity,
        refetchOnMount: 'always',
        refetchOnWindowFocus: false,
    })

    // Sync TQ result → Zustand store (so the rest of the app can read it)
    useEffect(() => {
        if (isLoading) return
        if (sessionUser) {
            setAuthStatus('authenticated')
            setMe(sessionUser)
        } else {
            setAuthStatus('unauthenticated')
            setMe(null)
        }
    }, [sessionUser, isLoading])

    // Derive address from auth store
    const address = me?.ego
    const displayName = address
        ? `${address.slice(0, 6)}…${address.slice(-4)}`
        : null

    if (authStatus === 'loading' || isLoading) {
        return (
            <>
                {/* Reserve space for 2 icons to prevent layout shift */}
                <span className="hn-header-icon" style={{ opacity: 0.3, pointerEvents: 'none' }}>
                    <User size={14} />
                </span>
                <span className="hn-header-icon" style={{ opacity: 0.3, pointerEvents: 'none' }}>
                    <LogOut size={14} />
                </span>
            </>
        )
    }

    if (authStatus === 'authenticated' && displayName && address) {
        return (
            <>
                {/* Profile icon */}
                {me?.username ? (
                    <Link
                        to="/user"
                        search={{ id: me.username }}
                        className="hn-header-icon"
                        aria-label="Profile"
                        title={displayName}
                    >
                        <User size={14} />
                    </Link>
                ) : (
                    <button
                        onClick={() => setConnectModalOpen(true)}
                        className="hn-header-icon"
                        type="button"
                        aria-label="Profile"
                        title="Set up your profile"
                    >
                        <User size={14} />
                    </button>
                )}
                {/* Logout button */}
                <button
                    onClick={async () => {
                        try { await authApi.logout() } catch { }
                        setAuthStatus('unauthenticated')
                        setMe(null)
                        // Invalidate the cached /me so next check hits the server
                        queryClient.setQueryData(queryKeys.authMe(), null)
                        try {
                            const { disconnect } = await import('wagmi/actions')
                            const { wagmiConfig } = await import('./wagmi-config')
                            disconnect(wagmiConfig)
                        } catch { }
                    }}
                    type="button"
                    className="hn-header-icon"
                    title="Disconnect"
                >
                    <LogOut size={14} />
                </button>
            </>
        )
    }

    return (
        <button
            onClick={() => setConnectModalOpen(true)}
            className="hn-header-icon"
            type="button"
            title="Connect Wallet"
        >
            <CreditCard size={14} />
        </button>
    )
}
