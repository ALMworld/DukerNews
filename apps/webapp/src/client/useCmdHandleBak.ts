// /**
//  * useCmdHandle — TanStack Mutation hook for sending commands to the server.
//  *
//  * Encapsulates:
//  *   1. Reading userEvtSeq from IndexedDB
//  *   2. Building the Cmd protobuf message
//  *   3. Calling rpcClient.handleCmd via ConnectRPC
//  *   4. Persisting the updated userEvtSeq back to IndexedDB on success
//  *
//  * Components never touch protobuf types, IDB, or the RPC client directly.
//  *
//  * Usage:
//  *   const { sendCmd, isPending, error } = useCmdHandle()
//  *
//  *   await sendCmd({
//  *     address,
//  *     cmdType: CmdType.CREATE_COMMENT,
//  *     payload: { case: 'createComment', value: { postId, parentId, text, locale } },
//  *     onSuccess: (resp) => { ... },  // optional
//  *   })
//  */

// import { useMutation } from '@tanstack/react-query'
// import { create, type MessageInitShape } from '@bufbuild/protobuf'
// import { CmdSchema, CmdDataSchema, CmdService } from '@repo/apidefs'
// import type { CmdType, PbDeltaEventsResp } from '@repo/apidefs'
// import { getUserEvtSeq, setUserEvtSeq } from '../lib/client-db'
// import { createClient } from '@connectrpc/connect'
// import { createConnectTransport } from '@connectrpc/connect-web'

// // Dedicated CmdService client — points to same /rpc base but uses CmdService schema
// const cmdTransport = createConnectTransport({ baseUrl: '/rpc' })
// const cmdClient = createClient(CmdService, cmdTransport)

// // ─── Types ───────────────────────────────────────────────

// /** The plain-object init shape for a CmdData payload oneof.
//  *  Accepts `{ case: 'createComment', value: { postId, ... } }` without $typeName. */
// export type CmdPayloadInit = MessageInitShape<typeof CmdDataSchema>['payload']

// export interface SendCmdArgs {
//     /** Wallet address of the actor. */
//     address: string
//     /** The command type (CmdType enum value). */
//     cmdType: CmdType
//     /** The oneof payload — plain init object, no $typeName required. */
//     payload: CmdPayloadInit
//     /** Called with the server response on success. Optional. */
//     onSuccess?: (resp: PbDeltaEventsResp) => void | Promise<void>
// }

// // ─── Hook ────────────────────────────────────────────────

// export function useCmdHandle() {
//     const mutation = useMutation({
//         mutationFn: async ({ address, cmdType, payload }: SendCmdArgs) => {
//             // 1. Get the current event sequence from IDB
//             const userEvtSeq = await getUserEvtSeq(address)

//             // 2. Build the Cmd protobuf message
//             const cmd = create(CmdSchema, {
//                 address,
//                 userEvtSeq: BigInt(userEvtSeq),
//                 cmdType,
//                 data: create(CmdDataSchema, { payload }),
//             })

//             // 3. Send to server via ConnectRPC
//             //    Cast is required because ConnectRPC returns Message<string> internally
//             //    but the actual runtime shape matches PbDeltaEventsResp.
//             return cmdClient.handleCmd(cmd) as Promise<PbDeltaEventsResp>
//         },

//         onSuccess: async (resp, { address, onSuccess }) => {
//             // 4. Persist the updated userEvtSeq to IDB
//             const lastEvt = resp.events[resp.events.length - 1]
//             if (lastEvt) {
//                 await setUserEvtSeq(address, Number(lastEvt.evtSeq))
//             }

//             // 5. Call the per-invocation callback (e.g. update local React state)
//             await onSuccess?.(resp)
//         },
//     })

//     return {
//         /** Fire a command. Awaitable — resolves when the server responds. */
//         sendCmd: mutation.mutateAsync,
//         /** True while the mutation is in-flight. */
//         isPending: mutation.isPending,
//         /** The error, if the last mutation failed. */
//         error: mutation.error,
//         /** Reset error / idle state. */
//         reset: mutation.reset,
//     }
// }
