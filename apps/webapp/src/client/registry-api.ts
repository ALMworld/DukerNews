/**
 * registry-api.ts — Client for the DukerRegistry Worker API.
 * 
 * After minting a username on-chain, call notifyRegistryWorker() to sync
 * the identity to the worker-dukiregistry-api (indexes events + materializes user).
 */

import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import {
    AlmWorldMinterService,
    BlockchainSyncService as BlockchainSyncServiceDef,
    ContractType,
    DukiAggService,
    DukigenRegistryService,
} from '@repo/dukiregistry-apidefs'
import type { AlmWorldDukiMinterOverview, DealDukiMintedEvent, DukigenAgent } from '@repo/dukiregistry-apidefs'

const REGISTRY_WORKER_URL = (import.meta as any).env?.VITE_REGISTRY_WORKER_URL ?? 'http://localhost:8788'

/**
 * Notify the BlockchainSyncService about a DukerRegistry tx.
 * Fire-and-forget — errors are logged but don't block the UI.
 */
export async function notifyRegistryWorker(txHash: string, chainEid: number): Promise<{ latestEvtSeq?: number }> {
    try {
        const resp = await fetch(`${REGISTRY_WORKER_URL}/dukiregistry.BlockchainSyncService/NotifyTx`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
            },
            body: JSON.stringify({ contract: 'DUKER_REGISTRY', txHash, chainEid }),
        })
        if (!resp.ok) {
            console.warn('[registry-api] NotifyTx(DUKER) failed:', resp.status, await resp.text())
            return {}
        }
        const data = await resp.json() as any
        const events = data.dukerEvents ?? []
        console.log('[registry-api] Synced', events.length, 'duker events to registry worker')
        const latestEvtSeq = events.reduce((max: number, e: any) => Math.max(max, Number(e.evtSeq ?? 0)), 0)
        return { latestEvtSeq: latestEvtSeq || undefined }
    } catch (err) {
        console.warn('[registry-api] NotifyTx(DUKER) error (non-blocking):', err)
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
        return await resp.json()
    } catch {
        return { available: true } // assume available if worker is unreachable
    }
}

/**
 * Trigger a full sync of DukerRegistry events for a chain.
 * Used for AlreadyHasIdentity recovery — ensures the worker D1 is up-to-date.
 */
export async function syncDukerEvents(chainEid: number): Promise<{ lastEvtSeq?: number; eventsIndexed?: number }> {
    try {
        const resp = await fetch(`${REGISTRY_WORKER_URL}/dukiregistry.BlockchainSyncService/SyncEvents`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
            },
            body: JSON.stringify({ contract: 'DUKER_REGISTRY', chainEid }),
        })
        if (!resp.ok) return {}
        const data = await resp.json() as any
        return {
            lastEvtSeq: data.lastEvtSeq != null ? Number(data.lastEvtSeq) : undefined,
            eventsIndexed: data.eventsIndexed != null ? Number(data.eventsIndexed) : undefined,
        }
    } catch {
        return {}
    }
}
// ── DukigenRegistryService (ConnectRPC binary client) ─────────────────────

const dukigenTransport = createConnectTransport({
    baseUrl: REGISTRY_WORKER_URL,
})

export const dukigenClient = createClient(DukigenRegistryService, dukigenTransport)
export const minterClient = createClient(AlmWorldMinterService, dukigenTransport)
export const syncClient = createClient(BlockchainSyncServiceDef, dukigenTransport)
export const dukiAggClient = createClient(DukiAggService, dukigenTransport)

export type { DukigenAgent, DealDukiMintedEvent, AlmWorldDukiMinterOverview }

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
export async function notifyDukiRegistry(txHash: string, chainEid: number): Promise<void> {
    try {
        await syncClient.notifyTx({ contract: ContractType.DUKIGEN_REGISTRY, txHash, chainEid })
    } catch {
        // Best-effort; don't block the UI
    }
}

export const notifyDukigenTx = notifyDukiRegistry

/**
 * List DUKIGEN agents (paginated, sorted by created_at DESC). Kept around
 * for any callers that need the raw newest-first list — /market uses the
 * ranked endpoint below.
 */
export async function getDukigenAgents(opts: { page?: number; perPage?: number } = {}): Promise<{
    agents: Array<DukigenAgent>
    total: number
}> {
    try {
        const resp = await dukigenClient.getAgents({
            page: opts.page ?? 1,
            perPage: opts.perPage ?? 100,
        })
        return { agents: resp.agents, total: Number(resp.total) }
    } catch {
        return { agents: [], total: 0 }
    }
}

// ── Ranked listing ─────────────────────────────────────────────────────────

export type Timescale = 'all' | 'year' | 'month' | 'week'

export type RankedAgentEntry = {
    agent: DukigenAgent
    credibility: number
}

export type MarketOverview = {
    featuredAgents: Array<RankedAgentEntry>
    trendingAgents: Array<RankedAgentEntry>
    marketActivity: Array<DealDukiMintedEvent>
    summary: {
        totalAgents: number
        totalVolume: string
        activeChains: number
        transactionCount: number
        chains: Array<AlmWorldDukiMinterOverview>
    }
}

export type RankedAgentsPage = {
    items: Array<RankedAgentEntry>
    nextCursor: string
    hasMore: boolean
}

/**
 * Fetch one page of agents ranked by credibility for the given timescale.
 * The server returns rows already ordered (credibility DESC, agentId DESC) and
 * supplies an opaque cursor for the next page — pass the cursor back verbatim.
 */
export async function listAgentsRanked(
    timescale: Timescale,
    cursor: string = '',
    limit: number = 50,
): Promise<RankedAgentsPage> {
    try {
        const resp = await dukigenClient.listAgentsRanked({ timescale, cursor, limit })
        return {
            items: resp.items.map((it) => ({
                agent: it.agent!,
                credibility: Number(it.credibility),
            })),
            nextCursor: resp.nextCursor,
            hasMore: Boolean(resp.hasMore),
        }
    } catch {
        return { items: [], nextCursor: '', hasMore: false }
    }
}

export async function getQuickOverview(opts: {
    featuredLimit?: number
    trendingLimit?: number
    activityLimit?: number
} = {}): Promise<MarketOverview> {
    try {
        const resp = await dukiAggClient.getQuickOverview({})
        const featuredLimit = opts.featuredLimit ?? resp.featuredAgents.length
        const trendingLimit = opts.trendingLimit ?? resp.trendingAgents.length
        return {
            featuredAgents: resp.featuredAgents
                .slice(0, featuredLimit)
                .filter((it) => it.agent)
                .map((it) => ({ agent: it.agent!, credibility: Number(it.credibility) })),
            trendingAgents: resp.trendingAgents
                .slice(0, trendingLimit)
                .filter((it) => it.agent)
                .map((it) => ({ agent: it.agent!, credibility: Number(it.credibility) })),
            marketActivity: resp.recentDukiEvents.slice(0, opts.activityLimit ?? resp.recentDukiEvents.length),
            summary: {
                totalAgents: resp.totalAgents,
                totalVolume: formatD6Amount(resp.totalD6Amount),
                activeChains: resp.activeChainCount,
                transactionCount: Number(resp.transactionsCount),
                chains: resp.minterOverview,
            },
        }
    } catch {
        const entries = await loadMarketEntriesFallback()
        return {
            featuredAgents: entries.slice(0, opts.featuredLimit ?? 3),
            trendingAgents: entries.slice(0, opts.trendingLimit ?? 5),
            marketActivity: [],
            summary: {
                totalAgents: entries.length,
                totalVolume: '0',
                activeChains: new Set(entries.flatMap(e => e.agent.opContracts.map(c => c.chainEid))).size,
                transactionCount: 0,
                chains: [],
            },
        }
    }
}

export function formatD6Amount(amount: bigint | number): string {
    const value = typeof amount === 'bigint' ? Number(amount) / 1_000_000 : amount / 1_000_000
    if (!Number.isFinite(value) || value <= 0) return '0'
    if (value >= 1_000_000_000) return `${trimFixed(value / 1_000_000_000, 2)}B`
    if (value >= 1_000_000) return `${trimFixed(value / 1_000_000, 2)}M`
    if (value >= 1_000) return `${trimFixed(value / 1_000, 2)}K`
    return trimFixed(value, value >= 10 ? 2 : 4)
}

function trimFixed(value: number, digits: number): string {
    return value.toFixed(digits).replace(/\.?0+$/, '')
}

async function loadMarketEntriesFallback(): Promise<Array<RankedAgentEntry>> {
    const agents: Array<DukigenAgent> = []
    let total = Number.POSITIVE_INFINITY
    let page = 1
    const pageSize = 100
    const maxItems = 500

    while (agents.length < Math.min(total, maxItems)) {
        const resp = await getDukigenAgents({ page, perPage: pageSize })
        total = resp.total
        agents.push(...resp.agents)
        if (resp.agents.length === 0 || agents.length >= total) break
        page += 1
    }

    const credibility = new Map<string, number>()
    let cursor = ''
    let rankedLoaded = 0
    do {
        const resp = await listAgentsRanked('all', cursor, pageSize)
        for (const item of resp.items) {
            credibility.set(String(item.agent.agentId), item.credibility)
        }
        rankedLoaded += resp.items.length
        cursor = resp.hasMore ? resp.nextCursor : ''
    } while (cursor && rankedLoaded < maxItems)

    return agents
        .slice(0, maxItems)
        .map((agent) => ({
            agent,
            credibility: credibility.get(String(agent.agentId)) ?? 0,
        }))
        .sort((a, b) => (b.credibility - a.credibility) || (Number(b.agent.agentId) - Number(a.agent.agentId)))
}

// ── AlmWorldMinterService (DealDukiMinted feed) ─────────────────────────

export type DealEventsPage = {
    events: Array<DealDukiMintedEvent>
    nextCursor: string
    hasMore: boolean
}

const EMPTY_DEAL_PAGE: DealEventsPage = { events: [], nextCursor: '', hasMore: false }

/** Fetch deals paid to a specific agent (newest first). */
export async function getAgentDeals(
    agentId: string | bigint,
    opts: { chainEid?: number; cursor?: string; limit?: number } = {},
): Promise<DealEventsPage> {
    try {
        const resp = await minterClient.getAgentDeals({
            agentId: BigInt(agentId),
            chainEid: opts.chainEid ?? 0,
            cursor: opts.cursor ?? '',
            limit: opts.limit ?? 20,
        })
        return {
            events: resp.events,
            nextCursor: resp.nextCursor,
            hasMore: Boolean(resp.hasMore),
        }
    } catch {
        return EMPTY_DEAL_PAGE
    }
}

/** Fetch the most recent deals across all agents (market activity feed). */
export async function getRecentDeals(
    opts: { chainEid?: number; cursor?: string; limit?: number } = {},
): Promise<DealEventsPage> {
    try {
        const resp = await minterClient.getRecentDeals({
            chainEid: opts.chainEid ?? 0,
            cursor: opts.cursor ?? '',
            limit: opts.limit ?? 20,
        })
        return {
            events: resp.events,
            nextCursor: resp.nextCursor,
            hasMore: Boolean(resp.hasMore),
        }
    } catch {
        return EMPTY_DEAL_PAGE
    }
}

/** Fetch deals involving a specific wallet (as minter or receiver, newest first). */
export async function getWalletDeals(
    wallet: string,
    opts: { chainEid?: number; cursor?: string; limit?: number } = {},
): Promise<DealEventsPage> {
    try {
        const resp = await minterClient.getWalletDeals({
            wallet,
            chainEid: opts.chainEid ?? 0,
            cursor: opts.cursor ?? '',
            limit: opts.limit ?? 20,
        })
        return {
            events: resp.events,
            nextCursor: resp.nextCursor,
            hasMore: Boolean(resp.hasMore),
        }
    } catch {
        return EMPTY_DEAL_PAGE
    }
}

/**
 * Webhook the worker after a successful AlmWorldDukiMinter tx so it can pull
 * the receipt and index the DealDukiMinted logs. Fire-and-forget — errors are
 * logged but don't block the UI flow.
 */
export async function notifyMinterTx(txHash: string, chainEid: number): Promise<void> {
    try {
        await syncClient.notifyTx({ contract: ContractType.ALM_WORLD_MINTER, txHash, chainEid })
    } catch (err) {
        console.warn('[registry-api] NotifyTx(MINTER) error (non-blocking):', err)
    }
}
