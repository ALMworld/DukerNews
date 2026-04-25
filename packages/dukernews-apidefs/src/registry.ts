/**
 * Proto registry — maps $typeName to DescMessage for toBinary/fromBinary lookups.
 * Built from all generated file descriptors.
 */

import { createRegistry } from '@bufbuild/protobuf'

import { file_dukernews } from './gen/dukernews_pb.js'
import { file_dukernews_es } from './gen/dukernews_es_pb.js'
import { file_duki_dao } from './gen/duki_dao_pb.js'
import { file_dukernews_rpc } from './gen/dukernews_rpc_pb.js'
import { file_schema_transcript } from './gen/schema_transcript_pb.js'

/**
 * Registry containing all proto message/enum descriptors.
 * Use `registry.getMessage(typeName)` to look up a DescMessage by its fully-qualified name.
 */
export const registry = createRegistry(
    file_dukernews,
    file_dukernews_es,
    file_duki_dao,
    file_dukernews_rpc,
    file_schema_transcript,
)
