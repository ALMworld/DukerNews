/**
 * createServerFn wrappers for user operations.
 * Reads are proxied to Go API when MIGRATED=true.
 * 
 * NOTE: CmdService writes are DEPRECATED — all writes go on-chain via smart contracts.
 * The mintUser and updateUser functions below retain the D1 fallback for now.
 */

import { createServerFn } from '@tanstack/react-start'
import { createClient } from '@connectrpc/connect'
import { QueryService } from '@repo/dukernews-apidefs'
// import { CmdService, CmdType, CmdSchema, CmdDataSchema } from '@repo/dukernews-apidefs'
// import { create } from '@bufbuild/protobuf'
import type { UserProfile } from '../services/user-service'
import { ConnectError, Code } from '@connectrpc/connect'
import { getGoApiTransport, MIGRATED } from '../lib/grpc-goapi-transport'
import * as UserService from '../services/user-service'
import type { UpdateUserInput } from '../services/user-service'

// ─── Reads ───────────────────────────────────────────────

export const getUser = createServerFn({ method: 'GET' })
    .inputValidator((input: { identifier: string }) => input)
    .handler(async ({ data }) => {
        if (MIGRATED) {
            const client = createClient(QueryService, getGoApiTransport())
            try {
                const u = await client.getUser({ address: data.identifier }) as unknown as UserProfile
                return u
            } catch (err) {
                if (err instanceof ConnectError && err.code === Code.NotFound) return null
                throw err
            }
        }
        return UserService.getUser(data.identifier)
    })

// ─── Writes (DEPRECATED: CmdService removed, all writes go on-chain) ───

/** Fire MINT_USER to create + name a user atomically (upsert). */
export const mintUser = createServerFn({ method: 'POST' })
    .inputValidator((input: { address: string; username: string }) => input)
    .handler(async ({ data }) => {
        // if (MIGRATED) {
        //     const client = createClient(CmdService, getGoApiTransport())
        //     return client.handleCmd(create(CmdSchema, {
        //         address: data.address,
        //         cmdType: CmdType.MINT_USER,
        //         data: create(CmdDataSchema, {
        //             payload: { case: 'mintUser', value: { address: data.address, username: data.username } },
        //         }),
        //     }))
        // }
        // sqlite / D1 path: upsert username directly
        return UserService.updateUser({ address: data.address, username: data.username })
    })

/** Fire AMEND_USER to update about/email. */
export const updateUser = createServerFn({ method: 'POST' })
    .inputValidator((input: UpdateUserInput) => input)
    .handler(async ({ data }) => {
        // if (MIGRATED) {
        //     const client = createClient(CmdService, getGoApiTransport())
        //     await client.handleCmd(create(CmdSchema, {
        //         address: data.address,
        //         cmdType: CmdType.AMEND_USER,
        //         data: create(CmdDataSchema, {
        //             payload: { case: 'amendUser', value: {
        //                 address: data.address,
        //                 about: data.about ?? '',
        //                 email: data.email ?? '',
        //             }},
        //         }),
        //     }))
        //     // Re-fetch updated profile to return
        //     const client2 = createClient(QueryService, getGoApiTransport())
        //     return client2.getUser({ address: data.address }) as unknown as UserProfile
        // }
        return UserService.updateUser(data)
    })
