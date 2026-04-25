/**
 * useUpvoteMutation — TanStack Query mutation for upvoting posts/comments.
 *
 * Encapsulates the full flow:
 *   1. Build protobuf txData
 *   2. dispatch() on-chain (user pays gas)
 *   3. On success: update IDB + query cache via useInteractions.updateBits
 *
 * Usage:
 *   const { mutate: upvote, isPending } = useUpvoteMutation({ ... })
 *   <BoostArrow loading={isPending} onClick={() => upvote()} />
 */

import { useMutation } from '@tanstack/react-query'
import { create } from '@bufbuild/protobuf'
import {
    AggType,
    EventType,
    DukerTxReqSchema,
    EventDataSchema,
    UpvoteAttentionPayloadSchema,
} from '@repo/dukernews-apidefs'
import { useChainHandle } from './useChainHandle'
import { useInteractions, VOTE_MASK, VOTE_UP } from './useInteractions'

interface UseUpvoteMutationOpts {
    aggType: AggType
    aggId: number | bigint
    address: string
}

export function useUpvoteMutation({ aggType, aggId, address }: UseUpvoteMutationOpts) {
    const { dispatch } = useChainHandle()
    const { getBits, updateBits } = useInteractions()

    return useMutation({
        mutationFn: async () => {
            const txData = create(DukerTxReqSchema, {
                address,
                aggType,
                aggId: BigInt(aggId),
                evtType: EventType.UPVOTE_ATTENTION,
                data: create(EventDataSchema, {
                    payload: {
                        case: 'upvoteAttention',
                        value: create(UpvoteAttentionPayloadSchema, {}),
                    },
                }),
            })
            return dispatch(txData, false) // direct chain — free op, user pays gas
        },
        onSuccess: async () => {
            const currentBits = getBits(aggType, Number(aggId))
            await updateBits(aggType, Number(aggId), (currentBits & ~VOTE_MASK) | VOTE_UP)
        },
    })
}
