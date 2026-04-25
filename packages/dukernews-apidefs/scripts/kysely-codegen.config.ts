import { RawExpressionNode } from 'kysely-codegen';
import type { Config } from 'kysely-codegen';

// Helper for Generated<number> type - optional on insert, required on update
const generatedNumber = new RawExpressionNode('Generated<number>');
// ID fields: proto uses int64 → bigint, so Kysely types must match
const generatedBigint = new RawExpressionNode('Generated<bigint>');
const bigintType = new RawExpressionNode('bigint');
const bigintOrNull = new RawExpressionNode('bigint | null');

const config: Config = {
    dialect: 'sqlite',
    overrides: {
        columns: {
            // Type transcriptData as TranscriptData JSON object from domain/aggregates
            'videos.transcriptData': new RawExpressionNode(
                'import("../domain/aggregates").TranscriptData | null'
            ),
            // Type status as AwarenessStatus enum from protobuf
            'words.status': new RawExpressionNode(
                'import("../gen/es_pb").AwarenessStatus | null'
            ),
            // create_time & update_time: optional on insert, required on update
            'profiles.create_time': generatedNumber,
            'profiles.update_time': generatedNumber,
            'videos.create_time': generatedNumber,
            'videos.update_time': generatedNumber,
            'names.create_time': generatedNumber,
            'names.update_time': generatedNumber,
            'nameless_context.create_time': generatedNumber,
            // Entity ID fields: match proto int64 → bigint
            'posts.id': generatedBigint,
            'comments.id': generatedBigint,
            'comments.post_id': bigintType,
            'comments.parent_id': bigintOrNull,
            'user_interactions.agg_id': bigintType,
        },
    },
};

export default config;

