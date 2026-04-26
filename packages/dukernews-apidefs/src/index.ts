/**
 * Example function.
 *
 * @example
 *
 * Use from other apps/packages:
 *
 * ```ts
 * import { hello } from '@repo/dukernews-apidefs'
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
export * from './gen/dukernews_rpc_pb.js'
export * from './gen/dukernews_pb.js'
export * from './gen/dukernews_es_pb.js'
export * from './gen/payment_pb.js'
export * from './gen/schema_transcript_pb.js'

// Re-export shared enums from dukiregistry-apidefs (single source of truth)
export { ProductType, ProductTypeSchema, DukiType, DukiTypeSchema } from '@repo/dukiregistry-apidefs'

// Export database schema and types
export * from './db/index.js'
export * from './utils/text.js'
export { deflateRaw, inflateRaw } from './utils/compression.js'

// Export proto registry
export { registry } from './registry.js'
