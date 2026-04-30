/**
 * createServerFn wrappers for comment operations.
 * Thin layer — delegates to CommentService (sqlite/D1) unless MIGRATE=true,
 * in which case reads are proxied to the Go API via ConnectRPC.
 */

import { createServerFn } from '@tanstack/react-start'
import { createClient } from '@connectrpc/connect'
import { QueryService } from '@repo/dukernews-apidefs'
import type { PbGetRecentCommentsResp } from '@repo/dukernews-apidefs'
import { getGoApiTransport, MIGRATED } from '../lib/grpc-goapi-transport'
import * as CommentService from '../services/comment-service'

/** SSR limits: bots get all comments for SEO, normal users get paginated */
const LIMIT_NORMAL = 1000
const LIMIT_BOT = 10000

export const getComments = createServerFn({ method: 'GET' })
    .inputValidator((input: { postId: number; limit?: number; offset?: number; isBot?: boolean }) => input)
    .handler(async ({ data }) => {
        // if (MIGRATED) {
        //     const client = createClient(QueryService, getGoApiTransport())
        //     return client.getComments({ postId: data.postId })
        // }
        return CommentService.getComments(BigInt(data.postId), {
            limit: data.limit ?? (data.isBot ? LIMIT_BOT : LIMIT_NORMAL),
            offset: data.offset,
        })
    })

export const getRecentComments = createServerFn({ method: 'GET' })
    .inputValidator((input: { limit?: number }) => input)
    .handler(async ({ data }) => {
        // if (MIGRATED) {
        //     const client = createClient(QueryService, getGoApiTransport())
        //     const resp = await client.getRecentComments({ limit: data.limit }) as unknown as PbGetRecentCommentsResp
        //     return resp.comments ?? []
        // }
        return CommentService.getRecentComments(data.limit)
    })

export const getUserThreads = createServerFn({ method: 'GET' })
    .inputValidator((input: { identifier: string; limit?: number; next?: number }) => input)
    .handler(async ({ data }) => CommentService.getUserThreads(data.identifier, {
        limit: data.limit,
        next: data.next !== undefined ? BigInt(data.next) : undefined,
    }))

// export const addComment = createServerFn({ method: 'POST' })
//     .inputValidator((input: AddCommentInput) => input)
//     .handler(async ({ data }) => CommentService.addComment(data))
