/**
 * ConnectRPC client for DukerNews backend.
 * Uses Node.js transport (not browser) to call QueryService and CmdService.
 */

import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-node'
import { QueryService, CmdService } from '@repo/dukernews-apidefs'
import { config } from '../utils/config.js'

const transport = createConnectTransport({
    baseUrl: config.apiUrl,
    httpVersion: '1.1',
})

/** Read-only queries: getPosts, getPostAgg, getComments, etc. */
export const queryClient = createClient(QueryService, transport)

/** Write commands: x402Handle, notifyTx */
export const cmdClient = createClient(CmdService, transport)
