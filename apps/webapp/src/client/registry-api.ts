/**
 * registry-api.ts — Client for the DukerRegistry Worker API.
 * 
 * After minting a username on-chain, call notifyRegistryWorker() to sync
 * the identity to the worker-dukiregistry-api (indexes events + materializes user).
 */

const REGISTRY_WORKER_URL = (import.meta as any).env?.VITE_REGISTRY_WORKER_URL ?? 'http://localhost:8787'

/**
 * Notify the DukerRegistry worker about a tx that contains registry events.
 * Fire-and-forget — errors are logged but don't block the UI.
 */
export async function notifyRegistryWorker(txHash: string, chainEid: number): Promise<void> {
    try {
        const resp = await fetch(`${REGISTRY_WORKER_URL}/dukiregistry.DukerRegistryService/NotifyDukerTx`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
            },
            body: JSON.stringify({ txHash, chainEid }),
        })
        if (!resp.ok) {
            console.warn('[registry-api] NotifyDukerTx failed:', resp.status, await resp.text())
        } else {
            const data = await resp.json() as any
            console.log('[registry-api] Synced', data.events?.length ?? 0, 'events to registry worker')
        }
    } catch (err) {
        console.warn('[registry-api] NotifyDukerTx error (non-blocking):', err)
    }
}

/**
 * Query the DukerRegistry worker for a user's identity by wallet address.
 */
export async function getRegistryUser(address: string, chainEid: number): Promise<any | null> {
    try {
        const resp = await fetch(`${REGISTRY_WORKER_URL}/dukiregistry.DukerRegistryService/GetUsername`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
            },
            body: JSON.stringify({ address, chainEid }),
        })
        if (!resp.ok) return null
        const data = await resp.json() as any
        return data.identity ?? null
    } catch {
        return null
    }
}
