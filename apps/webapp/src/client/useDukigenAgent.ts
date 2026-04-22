/**
 * useDukigenAgent — TanStack Query hook to load a DukiGen agent by token ID.
 *
 * Usage:
 *   const { agentIdInput, setAgentIdInput, loadAgent, agent, isLoading, error } = useDukigenAgent()
 *
 * The query is disabled until `loadAgent()` is called (explicit load via button).
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getDukigenAgent, type DukigenAgent } from './registry-api'

export function useDukigenAgent() {
    const [agentIdInput, setAgentIdInput] = useState('')
    const [agentIdToLoad, setAgentIdToLoad] = useState<string | null>(null)

    const query = useQuery<DukigenAgent | null>({
        queryKey: ['dukigen-agent', agentIdToLoad],
        queryFn: () => getDukigenAgent(agentIdToLoad!),
        enabled: agentIdToLoad !== null && agentIdToLoad.length > 0,
        staleTime: 60_000,
        retry: 1,
    })

    const loadAgent = () => {
        const trimmed = agentIdInput.trim()
        if (trimmed && /^\d+$/.test(trimmed)) {
            setAgentIdToLoad(trimmed)
        }
    }

    const notFound = query.isFetched && !query.data && agentIdToLoad !== null

    return {
        agentIdInput,
        setAgentIdInput,
        loadAgent,
        agent: query.data ?? null,
        isLoading: query.isLoading || query.isFetching,
        error: query.isError
            ? 'Failed to load agent'
            : notFound
                ? `Agent #${agentIdToLoad} not found`
                : '',
    }
}

