/**
 * Proto registry — maps $typeName to DescMessage for toBinary/fromBinary lookups.
 * Built from all generated file descriptors.
 */

import { createRegistry } from '@bufbuild/protobuf'

import { file_duker } from './gen/duker_pb.js'
import { file_duker_es } from './gen/duker_es_pb.js'
import { file_duki_dao } from './gen/duki_dao_pb.js'
import { file_rpc } from './gen/rpc_pb.js'
import { file_schema_transcript } from './gen/schema_transcript_pb.js'

/**
 * Registry containing all proto message/enum descriptors.
 * Use `registry.getMessage(typeName)` to look up a DescMessage by its fully-qualified name.
 */
export const registry = createRegistry(
    file_duker,
    file_duker_es,
    file_duki_dao,
    file_rpc,
    file_schema_transcript,
)
