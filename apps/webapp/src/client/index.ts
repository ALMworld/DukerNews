/**
 * Client service layer — all client-side server communication.
 *
 * Import from here in components:
 *   import { useChainHandle, translateText, getLocaleName, queryKeys } from '../client'
 */

export { rpcClient } from './rpc'
export { queryKeys } from './query-keys'
export { translateText, getLocaleName } from './translate-api'
export { useChainHandle } from './useChainHandle'
export type { DispatchResult } from './useChainHandle'
export { refreshAuth, x402MintUsername, notifyTx } from './auth-api'

