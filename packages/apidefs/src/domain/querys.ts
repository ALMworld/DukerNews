
import { Kysely, InferResult } from 'kysely'
import { jsonArrayFrom } from 'kysely/helpers/sqlite' // 或你的 helper 路径
import type { Selectable } from 'kysely'
import type { DB, Names, Videos } from '../db/types.generated'
import { AwarenessStatus } from '../gen/es_pb'

// ==========================================================
// 1. Video Agg Query (查一个视频，带出它包含的所有单词)
// ==========================================================
export function getVideoAggRowQuery(db: Kysely<DB>, vid: string) {
    return db
        .selectFrom('videos')
        .where('videos.vid', '=', vid)
        .select((eb) => [
            // --- Video 自身所有字段 ---
            'videos.vid',
            'videos.title',
            'videos.lang',
            'videos.cover',
            'videos.url',
            'videos.transcript_data', // ⚠️ 注意：数据量可能很大
            'videos.thumbnail_data',  // ⚠️ 注意：数据量可能很大
            'videos.archived',
            'videos.tags',
            'videos.create_time',
            'videos.update_time',

            // --- 聚合: Context + Names ---
            jsonArrayFrom(
                eb.selectFrom('nameless_context')
                    .innerJoin('names', 'names.nid', 'nameless_context.nid')
                    .whereRef('nameless_context.vid', '=', 'videos.vid')
                    .select([
                        // [Names 表字段]
                        'names.nid',
                        'names.awareness',
                        'names.awareness_time',
                        'names.awareness_time_day',
                        'names.review_time',
                        'names.review_count',
                        'names.notes',
                        // 重命名以避免冲突
                        'names.create_time as name_create_time',
                        'names.update_time as name_update_time',

                        // [Context 表字段]
                        // 'nameless_context.vid', // 不需要，父级已有
                        // 'nameless_context.nid', // 不需要，上面 names.nid 已有
                        'nameless_context.name',
                        'nameless_context.start_ms',
                        'nameless_context.end_ms',
                        'nameless_context.anchor_ms',
                        'nameless_context.surrounding',
                        // 重命名以避免冲突
                        'nameless_context.create_time as context_create_time'
                    ])
                    // 按 anchor_ms 排列
                    .orderBy('nameless_context.anchor_ms', 'asc')
            ).as('contextNames')
        ])
}

// ==========================================================
// 2. Name Agg Query (查一个单词，带出它出现的所有视频场景)
// ==========================================================
export function getNameAggRowQuery(db: Kysely<DB>, nid: string) {
    return db
        .selectFrom('names')
        .where('names.nid', '=', nid)
        .select((eb) => [
            // --- Name 自身所有字段 ---
            'names.nid',
            'names.awareness',
            'names.awareness_time',
            'names.awareness_time_day',
            'names.review_time',
            'names.review_count',
            'names.notes',
            'names.create_time',
            'names.update_time',

            // --- 聚合: Context + Videos ---
            jsonArrayFrom(
                eb.selectFrom('nameless_context')
                    .innerJoin('videos', 'videos.vid', 'nameless_context.vid')
                    .whereRef('nameless_context.nid', '=', 'names.nid')
                    .select([
                        // [Context 表字段]
                        'nameless_context.start_ms',
                        'nameless_context.anchor_ms',
                        'nameless_context.end_ms',
                        'nameless_context.name',
                        'nameless_context.surrounding',
                        // 重命名
                        'nameless_context.create_time as context_create_time',

                        // [Videos 表字段] - 它可以告诉你这个词出现在哪个视频里
                        'videos.vid',
                        'videos.title',
                        'videos.lang',
                        'videos.cover',
                        'videos.url',
                        // 'videos.tags',
                        'videos.archived',
                        // 重命名
                        'videos.create_time as video_create_time',
                        'videos.update_time as video_update_time',

                        // ⚠️ 性能警告：
                        // 在 names 聚合查询中，通常**不建议**包含 transcript_data 和 thumbnail_data。
                        // 因为如果一个词出现了 100 次，这些大字段就会被复制 100 次，导致 JSON 极其巨大。
                        // 如果你非常确定需要，取消下面的注释：
                        // 'videos.transcript_data', 
                        // 'videos.thumbnail_data'
                    ])
                    // 按上下文创建时间倒序（最近出现的排前面）
                    .orderBy('nameless_context.create_time', 'desc')
            ).as('videoContexts') // 这个词的“出现记录”
        ])
}
// 直接从 Query 变量推导结果类型

type VideoAggRowBuilderType = ReturnType<typeof getVideoAggRowQuery>

// 2. 从 Builder 中提取出 "执行后的结果类型"
// 注意：InferResult 默认推导出来的是数组 Array<Row>
// 所以通常我们需要加上 [number] 来获取单行的类型
export type VideoAggRow = InferResult<VideoAggRowBuilderType>[number]


type NameAggRowBuilderType = ReturnType<typeof getNameAggRowQuery>

// 2. 从 Builder 中提取出 "执行后的结果类型"
// 注意：InferResult 默认推导出来的是数组 Array<Row>
// 所以通常我们需要加上 [number] 来获取单行的类型
export type NameAggRow = InferResult<NameAggRowBuilderType>[number]



