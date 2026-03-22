/**
 * createServerFn wrappers for post operations.
 * Thin layer — delegates to PostService (sqlite/D1) unless MIGRATE=true,
 * in which case reads are proxied to the Go API via ConnectRPC.
 */

import { createServerFn } from '@tanstack/react-start'
import { createClient } from '@connectrpc/connect'
import { QueryService } from '@repo/apidefs'
import type { PbGetPostAggResp } from '@repo/apidefs'
import { getGoApiTransport, MIGRATED } from '../lib/grpc-goapi-transport'
import * as PostService from '../services/post-service'
import type { GetPostsInput, CreatePostInput, UpvotePostInput, GetPostAggInput } from '../services/post-service'

export const getPosts = createServerFn({ method: 'GET' })
    .inputValidator((input: GetPostsInput) => input)
    .handler(async ({ data }) => {
        // if (MIGRATED) {
        //     const client = createClient(QueryService, getGoApiTransport())
        //     return client.getPosts({
        //         kind: data.kind,
        //         page: data.page,
        //         perPage: data.perPage,
        //         sort: data.sort,
        //         q: data.q,
        //         cursor: data.nextCursor,
        //         address: data.address,
        //     })
        // }
        return PostService.getPosts(data)
    })

export const getPost = createServerFn({ method: 'GET' })
    .inputValidator((input: { id: number }) => input)
    .handler(async ({ data }) => {
        // if (MIGRATED) {
        //     const client = createClient(QueryService, getGoApiTransport())
        //     return client.getPost({ id: data.id })
        // }
        return PostService.getPost(data.id)
    })

export const getPostAgg = createServerFn({ method: 'GET' })
    .inputValidator((input: GetPostAggInput) => input)
    .handler(async ({ data }) => {
        // if (MIGRATED) {
        //     const client = createClient(QueryService, getGoApiTransport())
        //     const resp = await client.getPostAgg({
        //         id: data.id,
        //         commentLimit: data.commentLimit,
        //         isBot: data.isBot,
        //     }) as unknown as PbGetPostAggResp
        //     return { post: resp.post ?? null, comments: resp.comments ?? [], hasMore: false }
        // }
        return PostService.getPostAgg(data)
    })

// Write paths flow through ConnectRPC handleCmd — no goapi branch needed here.
export const submitPost = createServerFn({ method: 'POST' })
    .inputValidator((input: CreatePostInput) => input)
    .handler(async ({ data }) => PostService.createPost(data))

export const upvotePost = createServerFn({ method: 'POST' })
    .inputValidator((input: UpvotePostInput) => input)
    .handler(async ({ data }) => PostService.upvotePost(data))
