/**
 * Client-only auth store (zustand + localStorage persistence).
 * Server maintains no state — it just reads the JWT cookie.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthUser {
    ego: string        // wallet address
    chainId: string
    username?: string  // empty until MINT_NAME completes
    dukiBps?: number   // basis points for DUKI distribution (0-10000)
    expireAt: number
}

interface AuthState {
    authStatus: AuthStatus
    setAuthStatus: (status: AuthStatus) => void

    me: AuthUser | null
    setMe: (me: AuthUser | null) => void

    connectModalOpen: boolean
    setConnectModalOpen: (open: boolean) => void
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            authStatus: 'loading',
            setAuthStatus: (status) => set({ authStatus: status }),

            me: null,
            setMe: (me) => set({ me }),

            connectModalOpen: false,
            setConnectModalOpen: (open) => set({ connectModalOpen: open }),
        }),
        {
            name: 'duker-auth-storage',
            partialize: (state) => ({
                authStatus: state.authStatus === 'loading' ? 'unauthenticated' : state.authStatus,
                me: state.me,
            }),
        }
    )
)
