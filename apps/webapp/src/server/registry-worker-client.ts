/**
 * registry-worker-client.ts — SSR client for the DukerRegistry Worker API.
 *
 * Uses ConnectRPC's generated DukerRegistryService client (instead of raw fetch)
 * so request/response shapes track the proto definitions.
 *
 * In dev, calls go through vite's proxy (/worker-api → localhost:8788) to
 * bypass workerd's private-IP blocking. In production, set REGISTRY_WORKER_URL
 * to the deployed worker URL.
 */

import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import {
    BlockchainSyncService,
    ContractType,
    DukerRegistryService,
} from '@repo/dukiregistry-apidefs'
import type { Client } from '@connectrpc/connect'
import type { DukerIdentity } from '@repo/dukiregistry-apidefs'

const REGISTRY_WORKER_URL = process.env.REGISTRY_WORKER_URL ?? 'http://localhost:3000/worker-api'

let _client: Client<typeof DukerRegistryService> | null = null
let _syncClient: Client<typeof BlockchainSyncService> | null = null

function getClient(): Client<typeof DukerRegistryService> {
    if (!_client) {
        _client = createClient(DukerRegistryService, createRegistryTransport())
    }
    return _client
}

function getSyncClient(): Client<typeof BlockchainSyncService> {
    if (!_syncClient) {
        _syncClient = createClient(BlockchainSyncService, createRegistryTransport())
    }
    return _syncClient
}

function createRegistryTransport() {
    return createConnectTransport({
        baseUrl: REGISTRY_WORKER_URL,
        // workerd's edge fetch rejects redirect:"error" (the default for fetch).
        fetch: (input, init) => fetch(input, { ...init, redirect: 'manual' }),
    })
}

/** A serializable copy of DukerIdentity — bigints become strings, status drops. */
export interface RegistryIdentity {
    chainEid: number
    username: string
    tokenId: string
    ego: string
    bio: string
    website: string
}

function toPlain(i: DukerIdentity): RegistryIdentity {
    return {
        chainEid: Number(i.chainEid),
        username: i.username,
        tokenId: i.tokenId,
        ego: i.ego,
        bio: i.bio,
        website: i.website,
    }
}

/**
 * Fetch every identity owned by `address`. Pass `chainEid > 0` to limit to one
 * chain; pass 0 to get all chain presences (the merge case used at login).
 */
export async function getRegistryIdentities(
    address: string,
    chainEid: number = 0,
): Promise<Array<RegistryIdentity>> {
    try {
        const resp = await getClient().getUsername({ address: address.toLowerCase(), chainEid })
        return resp.identities.map(toPlain)
    } catch (err) {
        console.warn('[registry-worker-client] getUsername failed:', err)
        return []
    }
}

/**
 * Pick the identity to use as the primary username for an address.
 *   1. Prefer the identity whose chainEid matches the caller's current chain.
 *   2. Otherwise return the most recently registered one — tokenId encodes
 *      `(seq << 24) | chainEid`, so the largest tokenId is the latest mint.
 */
export function pickPrimaryIdentity(
    identities: Array<RegistryIdentity>,
    chainEid: number,
): RegistryIdentity | null {
    if (identities.length === 0) return null
    const onChain = identities.find(i => i.chainEid === chainEid)
    if (onChain) return onChain
    // Sort copy by tokenId desc; tokenId is a uint256 string so compare as bigint.
    return [...identities].sort((a, b) => {
        const ta = BigInt(a.tokenId)
        const tb = BigInt(b.tokenId)
        return ta > tb ? -1 : ta < tb ? 1 : 0
    })[0]
}

/**
 * Back-compat: single-identity lookup used by older callers. Returns the same
 * identity that `pickPrimaryIdentity` would, but with only the fields earlier
 * callers consumed.
 */
export async function getRegistryIdentity(
    address: string,
    chainEid: number,
): Promise<{ username?: string; tokenId?: string } | null> {
    const all = await getRegistryIdentities(address, 0)
    const primary = pickPrimaryIdentity(all, chainEid)
    if (!primary) return null
    return { username: primary.username, tokenId: primary.tokenId }
}

/**
 * Ask the registry worker to catch up DukerRegistry logs for a chain.
 * contractHead=0 lets the worker derive its own indexed cursor from D1.
 */
export async function syncRegistryIdentities(
    chainEid: number,
    contractHead: bigint = 0n,
): Promise<{ lastEvtSeq: bigint; eventsIndexed: number } | null> {
    try {
        const resp = await getSyncClient().syncEvents({
            contract: ContractType.DUKER_REGISTRY,
            chainEid,
            contractHead,
        })
        return {
            lastEvtSeq: resp.lastEvtSeq,
            eventsIndexed: resp.eventsIndexed,
        }
    } catch (err) {
        console.warn('[registry-worker-client] BlockchainSyncService.syncEvents failed:', err)
        return null
    }
}
