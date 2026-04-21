/**
 * registry-worker-client.ts — SSR client for the DukerRegistry Worker API.
 *
 * Used by server-side routes (refreshAuth) to query the registry worker.
 * In dev, calls go through vite's proxy (/worker-api → localhost:8788)
 * to bypass workerd's private-IP blocking.
 * In production, set REGISTRY_WORKER_URL to the deployed worker URL.
 */

const REGISTRY_WORKER_URL = process.env.REGISTRY_WORKER_URL ?? 'http://localhost:3000/worker-api'

/**
 * Query the registry worker for a user's identity by wallet address.
 */
export async function getRegistryIdentity(
    address: string,
    chainEid: number,
): Promise<{ username?: string; tokenId?: string } | null> {
    try {
        const resp = await fetch(
            `${REGISTRY_WORKER_URL}/dukiregistry.DukerRegistryService/GetUsername`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Connect-Protocol-Version': '1',
                },
                body: JSON.stringify({ address, chainEid }),
            },
        )
        if (!resp.ok) return null
        const data = (await resp.json()) as any
        if (!data.identity?.username) return null
        return {
            username: data.identity.username,
            tokenId: data.identity.tokenId,
        }
    } catch {
        return null
    }
}

/**
 * Check if a username exists in the registry worker.
 * TODO: Add a dedicated CheckUsername RPC to the registry worker.
 */

