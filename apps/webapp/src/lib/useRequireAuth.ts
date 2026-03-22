/**
 * Client-side auth guard hook.
 * Returns a gate function that checks auth status before write actions.
 * - Not logged in → opens ConnectModal, returns false
 * - Logged in but no username → navigates to user page with agreement=1, returns false
 * - Fully authenticated → returns true
 */
import { useAuthStore } from './authStore'

export function useRequireAuth() {
    const { authStatus, me, setConnectModalOpen } = useAuthStore()

    /** Call before any write action. Returns true if allowed to proceed. */
    const requireAuth = (): boolean => {
        if (authStatus !== 'authenticated' || !me) {
            setConnectModalOpen(true)
            return false
        }

        // username is '' until the user mints a real name
        // Show connect modal (Step 3 will guide them to /welcome)
        if (!me.username) {
            setConnectModalOpen(true)
            return false
        }

        return true
    }

    return { requireAuth, me, authStatus }
}
