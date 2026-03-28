/**
 * Example function.
 *
 * @example
 *
 * Use from other apps/packages:
 *
 * ```ts
 * import { hello } from '@repo/protos'
 *
 * hello()
 * ```
 */
export function hello() {
	return 'Hello, world!'
}

// Export generated definitions
export * from './gen/duki_dao_pb.js'

// Export service definitions:
export * from './gen/rpc_pb.js'
export * from './gen/duker_pb.js'
export * from './gen/duker_es_pb.js'
export * from './gen/payment_pb.js'
export * from './gen/schema_transcript_pb.js'
export * from './gen/google/rpc/status_pb.js'

// Export domain aggregates
export * from './domain/aggregates.js'
export * from './domain/querys.js'
export * from './domain/vid_utils.js'
export * from './domain/nonce_utils.js'

// Export database schema and types
export * from './db/index.js'
export * from './utils/text.js'
export { deflateRaw, inflateRaw } from './utils/compression.js'

// Export proto registry
export { registry } from './registry.js'
