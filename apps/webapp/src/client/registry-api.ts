/**
 * registry-api.ts — Client for the DukerRegistry Worker API.
 * 
 * After minting a username on-chain, call notifyRegistryWorker() to sync
 * the identity to the worker-dukiregistry-api (indexes events + materializes user).
 */

const REGISTRY_WORKER_URL = (import.meta as any).env?.VITE_REGISTRY_WORKER_URL ?? 'http://localhost:8788'

/**
 * Notify the DukerRegistry worker about a tx that contains registry events.
 * Fire-and-forget — errors are logged but don't block the UI.
 */
export async function notifyRegistryWorker(txHash: string, chainEid: number): Promise<{ latestEvtSeq?: number }> {
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
            return {}
        }
        const data = await resp.json() as any
        const events = data.events ?? []
        console.log('[registry-api] Synced', events.length, 'events to registry worker')
        // Return the latest evtSeq from synced events
        const latestEvtSeq = events.reduce((max: number, e: any) => Math.max(max, Number(e.evtSeq ?? 0)), 0)
        return { latestEvtSeq: latestEvtSeq || undefined }
    } catch (err) {
        console.warn('[registry-api] NotifyDukerTx error (non-blocking):', err)
        return {}
    }
}

/**
 * Query the DukerRegistry worker for a user's identity by wallet address.
 * Returns the matching identity for the given chain (or the first one if the
 * address only has identities on other chains).
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
        const identities = (data.identities ?? []) as Array<{ chainEid: number }>
        if (identities.length === 0) return null
        return identities.find(i => Number(i.chainEid) === chainEid) ?? identities[0]
    } catch {
        return null
    }
}

/**
 * Check if a username is available via the DukerRegistry worker.
 * Usernames are globally unique (the chain suffix is part of the username),
 * so no chain filter is required.
 */
export async function checkUsernameAvailability(username: string): Promise<{ available: boolean; owner?: any }> {
    try {
        const resp = await fetch(`${REGISTRY_WORKER_URL}/dukiregistry.DukerRegistryService/CheckUsername`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
            },
            body: JSON.stringify({ username }),
        })
        if (!resp.ok) return { available: true } // assume available if worker is down
        return await resp.json() as { available: boolean; owner?: any }
    } catch {
        return { available: true } // assume available if worker is unreachable
    }
}

/**
 * Trigger a full sync of DukerRegistry events for a chain.
 * Used for AlreadyHasIdentity recovery — ensures the worker D1 is up-to-date.
 */
export async function syncDukerEvents(chainEid: number, lastEvtSeq: number = 0): Promise<{ syncedUpTo?: number; eventsIndexed?: number }> {
    try {
        const resp = await fetch(`${REGISTRY_WORKER_URL}/dukiregistry.DukerRegistryService/SyncDukerEvents`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
            },
            body: JSON.stringify({ chainEid, lastEvtSeq: String(lastEvtSeq) }),
        })
        if (!resp.ok) return {}
        return await resp.json() as { syncedUpTo?: number; eventsIndexed?: number }
    } catch {
        return {}
    }
}
// ── DukigenRegistryService (ConnectRPC binary client) ─────────────────────

import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { DukigenRegistryService, type DukigenAgent } from '@repo/dukiregistry-apidefs'

const dukigenTransport = createConnectTransport({
    baseUrl: REGISTRY_WORKER_URL,
})

export const dukigenClient = createClient(DukigenRegistryService, dukigenTransport)

export type { DukigenAgent }

/**
 * Fetch a DukiGen agent by token ID using the generated ConnectRPC client.
 * Returns null if not found or worker is unreachable.
 */
export async function getDukigenAgent(agentId: string): Promise<DukigenAgent | null> {
    try {
        const agent = await dukigenClient.getAgent({ agentId: BigInt(agentId) })
        // Empty response (no name) means agent not found
        if (!agent.name) return null
        return agent
    } catch {
        return null
    }
}

/**
 * Notify the registry worker about a DukigenRegistry tx so it indexes the events.
 * Fire-and-forget — errors are silently swallowed.
 */
export async function notifyDukigenTx(txHash: string, chainEid: number): Promise<void> {
    try {
        await dukigenClient.notifyDukigenTx({ txHash, chainEid })
    } catch {
        // Best-effort; don't block the UI
    }
}
