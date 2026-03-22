/**
 * useInteractions — Client-side interaction state with IDB cache + server sync.
 *
 * Flow:
 *   1. On mount: read all interactions from IDB → instant render
 *   2. Compare local interaction_evt_seq with server user_evt_seq
 *   3. If stale: fetch from server → overwrite IDB → update local seq
 *   4. On mutations: update IDB immediately (optimistic)
 *
 * Usage:
 *   const { getBits, isUpvoted, setVoteBits } = useInteractions()
 *   const voted = isUpvoted('post', 42)
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../lib/authStore'
import {
    getAllLocalInteractions,
    putInteractions,
    setLocalInteraction,
    getInteractionSeq,
    setInteractionSeq,
    getUserEvtSeq,
} from '../lib/client-db'
import { rpcClient } from './rpc'
import { create } from '@bufbuild/protobuf'
import { PbGetUserInteractionsReqSchema } from '@repo/apidefs'
import { useCallback, useRef } from 'react'

// Re-export bit constants for convenience
export { VOTE_MASK, VOTE_UP, VOTE_DOWN, VOTE_NONE, BIT_FLAG, BIT_HIDE, BIT_FAVORITE, BIT_VOUCH }
    from '../lib/interaction-bits'

import { VOTE_MASK, VOTE_UP } from '../lib/interaction-bits'

// ─── Query key ──────────────────────────────────────────

const INTERACTIONS_KEY = ['interactions'] as const

// ─── Hook ───────────────────────────────────────────────

export function useInteractions() {
    const { me } = useAuthStore()
    const queryClient = useQueryClient()
    const syncingRef = useRef(false)

    // TanStack Query: reads from IDB, syncs from server if stale
    const { data: interactionMap } = useQuery({
        queryKey: INTERACTIONS_KEY,
        queryFn: async (): Promise<Map<string, number>> => {
            // 1. Read from IDB first
            const localMap = await getAllLocalInteractions()

            // 2. Sync from server in background if user is logged in
            if (me?.ego && me?.username && !syncingRef.current) {
                syncingRef.current = true
                syncFromServer(me.ego, me.username).then((serverMap) => {
                    if (serverMap) {
                        // Update the query cache with the fresh server data
                        queryClient.setQueryData(INTERACTIONS_KEY, serverMap)
                    }
                    syncingRef.current = false
                }).catch(() => {
                    syncingRef.current = false
                })
            }

            return localMap
        },
        // Only run when on client (not SSR)
        enabled: typeof window !== 'undefined',
        // Keep the data fresh for a while
        staleTime: 30_000,
        // Don't refetch on window focus (IDB is the source of truth)
        refetchOnWindowFocus: false,
    })

    // ── Read helpers ──────────────────────────────────────

    const getBits = useCallback((itemType: string, itemId: number): number => {
        return interactionMap?.get(`${itemType}:${itemId}`) ?? 0
    }, [interactionMap])

    const isUpvoted = useCallback((itemType: string, itemId: number): boolean => {
        const bits = getBits(itemType, itemId)
        return (bits & VOTE_MASK) === VOTE_UP
    }, [getBits])

    // ── Write helpers (optimistic update IDB + query cache) ──

    const updateBits = useCallback(async (
        itemType: string,
        itemId: number,
        newBits: number,
    ) => {
        const key = `${itemType}:${itemId}`

        // 1. Update IDB
        await setLocalInteraction(itemType, itemId, newBits)

        // 2. Update query cache (optimistic, no refetch)
        queryClient.setQueryData(INTERACTIONS_KEY, (old: Map<string, number> | undefined) => {
            const map = new Map(old ?? [])
            if (newBits === 0) {
                map.delete(key)
            } else {
                map.set(key, newBits)
            }
            return map
        })
    }, [queryClient])

    return { getBits, isUpvoted, updateBits, interactionMap }
}

// ─── Sync logic ─────────────────────────────────────────

async function syncFromServer(
    address: string,
    username: string,
): Promise<Map<string, number> | null> {
    try {
        // Check if we need to sync
        const localSeq = await getInteractionSeq(address)
        const serverSeq = await getUserEvtSeq(address)

        // If local is up to date, skip sync
        if (localSeq >= serverSeq && localSeq > 0) return null

        // Fetch all interactions from server via ConnectRPC
        const req = create(PbGetUserInteractionsReqSchema, { username })
        const resp = await rpcClient.getUserInteractions(req)

        // Map proto response to plain objects for IDB
        const rows = resp.interactions.map(i => ({
            item_type: i.itemType,
            item_id: i.itemId,
            bits_flag: i.bitsFlag,
        }))

        // Write to IDB
        await putInteractions(rows)

        // Update the local seq to match server
        await setInteractionSeq(address, serverSeq)

        // Build and return the map
        const map = new Map<string, number>()
        for (const row of rows) {
            map.set(`${row.item_type}:${row.item_id}`, row.bits_flag)
        }
        return map
    } catch {
        // Network error — local IDB still serves as cache
        return null
    }
}
