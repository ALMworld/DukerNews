/**
 * Singleton ConnectRPC client for client-side use.
 * All hooks in src/client/ share this single transport instance.
 */

import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { QueryService } from '@repo/apidefs'

const transport = createConnectTransport({
    baseUrl: '/rpc',
})

export const rpcClient = createClient(QueryService, transport)
