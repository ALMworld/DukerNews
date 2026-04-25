/**
 * Transcript and Word aggregation utilities
 * 
 * Structure:
 * - TranscriptData: Raw data stored in DB (SoA format)
 * - TranscriptAgg: Wrapper class with utility methods
 * - WordData: Single word entry
 * - WordAgg: Aggregation of words with methods
 * - VideoAgg: Aggregation of Video metadata, Transcript, and Words
 */

import type { Selectable } from 'kysely'
import type { DB, Names } from '../db/types.generated'
import { NameAggRow, VideoAggRow } from './querys'
import { AwarenessStatus } from '../gen/es_pb'

export type ContextName = VideoAggRow['contextNames'][number]

/**
 * A tokenized word with position metadata
 */
export interface WordToken {
    /** The word text (raw) */
    rawText: string
    /** trim space, and remove before and after non-alphanumeric characters */
    name: string
    /** Word index within the segment */
    index: number
    /** Anchor time in milliseconds for matching */
    anchorMs: number
}

/**
 * Enriched word with collection status and metadata
 */
export interface EnrichedWord extends WordToken {
    /** Whether this word was collected in this segment */
    collected: boolean
    /** Awareness level if collected */
    awareness?: AwarenessStatus
}

// =============================================================================
// NAME TYPES
// =============================================================================

/**
 * A single segment of a transcript with pre-computed tokens
 */
export interface TSegment {
    index: number
    startMs: number
    endMs: number       // min(nextStartMs - 10ms, disappearMs) - ends slightly before next
    durationMs: number
    disappearMs: number // startMs + durationMs - when text should disappear
    text: string
    tokens: WordToken[] // Pre-computed word tokens
}

/**
 * Raw transcript data structure (SoA - Structure of Arrays)
 * This is what's stored in the DB as JSON TEXT
 */
export interface TranscriptData {
    vid: string
    lang: string
    startMs: number[]
    durationMs: number[]
    texts: string[]
}

/** Gap in milliseconds before next segment starts (for smooth transitions) */
const SEGMENT_GAP_MS = 10

/**
 * Language-to-granularity mapping for Intl.Segmenter.
 * CJK languages use 'grapheme' (each character is a separate token),
 * others default to 'word' (natural word boundaries).
 */
const LANG_GRANULARITY: Record<string, Intl.SegmenterOptions['granularity']> = {
    zh: 'grapheme',
    ja: 'grapheme',
    ko: 'grapheme',
}

/**
 * TranscriptAgg - Wrapper class for working with transcript data
 * All segments and tokens are pre-computed in constructor for O(1) access
 */
export class TranscriptAgg {
    readonly vid: string
    readonly lang: string
    readonly segments: TSegment[]

    constructor(data: TranscriptData) {
        this.vid = data.vid
        this.lang = data.lang

        const len = data.texts.length
        this.segments = []

        const langPrefix = (data.lang || 'en').split('-')[0].toLowerCase()
        const granularity = LANG_GRANULARITY[langPrefix] ?? 'word'
        const segmenter = new Intl.Segmenter(data.lang || 'en', { granularity });

        for (let i = 0; i < len; i++) {
            const startMs = data.startMs[i] ?? 0
            const durationMs = data.durationMs[i] ?? 0
            const disappearMs = startMs + durationMs
            const text = data.texts[i] ?? ''

            // endMs = min(nextStartMs - gap, disappearMs)
            // If no next segment, endMs = disappearMs
            const nextStartMs = i < len - 1 ? (data.startMs[i + 1] ?? disappearMs) : disappearMs
            const endMs = Math.min(nextStartMs - SEGMENT_GAP_MS, disappearMs)

            // Pre-compute word tokens using Intl.Segmenter
            // Strategy: filter for word-like segments, then attach trailing
            // non-word segments (punctuation, spaces) to the preceding token's rawText.
            // This preserves original text display while keeping `name` clean for matching.
            //
            // Note: For 'grapheme' granularity, `isWordLike` is undefined on all segments,
            // so we use a Unicode regex to determine if a grapheme is a letter/ideograph.
            const allSegments = [...segmenter.segment(text)];
            const isWordLikeFn = granularity === 'grapheme'
                ? (s: Intl.SegmentData) => /\p{L}/u.test(s.segment)
                : (s: Intl.SegmentData) => !!s.isWordLike;
            const wordSegments = allSegments.filter(isWordLikeFn);

            const totalWords = wordSegments.length
            const anchorDuration = endMs - startMs

            // Build tokens with clean `name` for matching
            const tokens: WordToken[] = wordSegments.map((segment, idx) => ({
                rawText: segment.segment,
                name: segment.segment,
                index: idx,
                anchorMs: startMs + Math.floor(anchorDuration * idx / Math.max(totalWords, 1))
            }))

            // Attach trailing non-word-like text (punctuation, spaces) to each token's rawText
            // Walk through allSegments and accumulate non-word text after each word
            if (tokens.length > 0) {
                let tokenIdx = 0
                let trailingText = ''
                let leadingText = '' // text before the first word

                for (const seg of allSegments) {
                    if (isWordLikeFn(seg)) {
                        // If there's leading text before the very first word, prepend to first token
                        if (tokenIdx === 0 && leadingText) {
                            tokens[0].rawText = leadingText + tokens[0].rawText
                            leadingText = ''
                        }
                        // Attach accumulated trailing text to previous token
                        if (tokenIdx > 0 && trailingText) {
                            tokens[tokenIdx - 1].rawText += trailingText
                            trailingText = ''
                        }
                        tokenIdx++
                    } else {
                        if (tokenIdx === 0) {
                            leadingText += seg.segment
                        } else {
                            trailingText += seg.segment
                        }
                    }
                }
                // Attach any remaining trailing text to the last token
                if (trailingText && tokens.length > 0) {
                    tokens[tokens.length - 1].rawText += trailingText
                }
            }

            this.segments.push({
                index: i,
                startMs,
                endMs,
                durationMs,
                disappearMs,
                text,
                tokens
            })
        }
    }

    get length(): number { return this.segments.length }

    /**
     * Get segment at index
     */
    getSegment(index: number | null | undefined): TSegment | null {
        if (index === null || index === undefined || index < 0 || index >= this.segments.length) {
            return null
        }
        return this.segments[index]
    }

    /**
     * Get words at segment index
     */
    getWordsAt(index: number): WordToken[] {
        return this.segments[index]?.tokens ?? []
    }

    getSurroundingText({ idx, before = 1, after = 1 }: { idx: number, before?: number, after?: number }) {
        const segment = this.getSegment(idx)
        if (!segment) return ''
        const start = Math.max(0, idx - before)
        const end = Math.min(this.segments.length - 1, idx + after)
        return this.segments.slice(start, end + 1).map(s => s.text).join(' ')
    }

    /**
     * Find the segment that contains the given anchor time (binary search)
     */
    locateIndex(anchorMs: number): number {
        if (this.segments.length === 0) return -1

        let left = 0
        let right = this.segments.length - 1
        let result = -1

        while (left <= right) {
            const mid = Math.floor((left + right) / 2)
            const seg = this.segments[mid]
            const segmentStart = seg.startMs
            const segmentEnd = seg.endMs

            if (anchorMs >= segmentStart && anchorMs < segmentEnd) {
                result = mid
                break
            } else if (anchorMs < segmentStart) {
                right = mid - 1
            } else {
                result = mid
                left = mid + 1
            }
        }

        if (result === -1 && this.segments.length > 0) {
            result = 0
        }

        return result >= 0 ? result : -1
    }

    locateSegment(anchorMs: number): TSegment | null {
        const index = this.locateIndex(anchorMs)
        if (index < 0) return null
        return this.getSegment(index)
    }

    /**
     * Iterate over all segments
     */
    *[Symbol.iterator](): Generator<TSegment> {
        for (const segment of this.segments) {
            yield segment
        }
    }

    /**
     * Convert to array of TSegment objects
     */
    toArray(): TSegment[] {
        return this.segments
    }

    /**
     * Create from JSON string (stored in DB)
     */
    static fromJSON(json: string): TranscriptAgg {
        return new TranscriptAgg(JSON.parse(json) as TranscriptData)
    }

    /**
     * Serialize to JSON string (for DB storage)
     * Note: Converts back to TranscriptData format (without pre-computed fields)
     */
    toJSON(): string {
        const data: TranscriptData = {
            vid: this.vid,
            lang: this.lang,
            startMs: this.segments.map(s => s.startMs),
            durationMs: this.segments.map(s => s.durationMs),
            texts: this.segments.map(s => s.text)
        }
        return JSON.stringify(data)
    }
}

export class VideoAgg {
    readonly video: VideoAggRow;
    readonly transcript: TranscriptAgg | null

    /** Lazy cache for enriched words per segment */
    private _enrichedNamesCache: (EnrichedWord[] | undefined)[] = []

    constructor(video: VideoAggRow) {
        this.video = video
        this.transcript = TranscriptAgg.fromJSON(video.transcript_data ?? '{}')
    }

    // Accessor shortcuts
    get vid(): string { return this.video.vid }
    get title(): string { return this.video.title }
    get url(): string | null { return this.video.url ?? null }
    get cover(): string | null { return this.video.cover ?? null }
    get lang(): string | null { return this.video.lang ?? null }
    get archived(): number | null { return this.video.archived ?? null }
    get tags(): string | null { return this.video.tags ?? null }
    get contextNames() {
        const names = this.video.contextNames
        if (typeof names === 'string') {
            try {
                return JSON.parse(names) as VideoAggRow['contextNames']
            } catch {
                return []
            }
        }
        return names ?? []
    }

    /**
     * Get contextNames as a Map for O(1) lookup
     * Key format: "nid:anchorMs" (rounded to nearest 100ms)
     */
    private get contextNamesMap(): Map<string, ContextName> {
        const contextNamesMap = new Map()
        for (const ctx of this.contextNames) {
            // Round anchor_ms to nearest 100ms for tolerance matching
            const key = `${ctx.nid}:${Math.round(ctx.anchor_ms / 100) * 100}`
            contextNamesMap.set(key, ctx)
        }
        return contextNamesMap
    }

    /**
     * Check if a name has been marked in this video at a specific segment
     * @param nid - The name/word ID (normalized to lowercase)
     * @param startMs - Optional segment start time in milliseconds
     * @param endMs - Optional segment end time in milliseconds
     */
    marked(nid: string, startMs?: number, endMs?: number): boolean {
        const normalizedNid = nid.toLowerCase()
        return this.contextNames.some(ctx => {
            if (ctx.nid !== normalizedNid) return false
            // If no segment time provided, match any occurrence
            if (startMs === undefined || endMs === undefined) return true
            // Check if the context's time range overlaps with the segment
            return ctx.start_ms === startMs && ctx.end_ms === endMs
        })
    }

    /**
     * Get transcript segments as array
     */
    get segments(): TSegment[] {
        return this.transcript?.toArray() ?? []
    }

    locateIndexAt(anchorMs: number): number {
        return this.transcript?.locateIndex(anchorMs) ?? -1
    }

    locateSegmentAt(anchorMs: number): TSegment | null {
        return this.transcript?.locateSegment(anchorMs) ?? null
    }

    getSegmentAt(segIndex: number | null | undefined): TSegment | null {
        return this.transcript?.getSegment(segIndex) ?? null;
    }

    getSurroudingText(segIndex: number): string {
        return this.transcript?.getSurroundingText({ idx: segIndex }) ?? 'Context not available.'
    }

    /**
     * Lazy-computed enriched words per segment with per-token collection status.
     */
    get enrichedNames(): EnrichedWord[][] {
        if (this._enrichedNamesCache.length === 0 && this.transcript && this.transcript.length > 0) {
            const ctxMap = this.contextNamesMap

            for (let segIdx = 0; segIdx < this.transcript.length; segIdx++) {
                const wordTokens = this.transcript.getWordsAt(segIdx)

                this._enrichedNamesCache[segIdx] = wordTokens.map(token => {
                    const nid = token.name.toLowerCase()
                    const key = `${nid}:${Math.round(token.anchorMs / 100) * 100}`
                    const ctx = ctxMap.get(key)
                    return {
                        ...token,
                        collected: !!ctx,
                        awareness: ctx?.awareness as AwarenessStatus | undefined
                    }
                })
            }
        }
        return this._enrichedNamesCache as EnrichedWord[][]
    }

    /**
     * Get enriched words at segment index, merging consecutive tokens
     * that form collected compound names (e.g. "daddy pig") into single units.
     * Uses segment time range to filter candidates from sorted contextNames.
     */
    getEnrichedWordsAt(segIndex: number): EnrichedWord[] {
        const enriched = this.enrichedNames[segIndex] ?? []
        if (enriched.length === 0) return enriched

        const seg = this.transcript?.getSegment(segIndex)
        if (!seg) return enriched
        const segStart = seg.startMs
        const segEnd = seg.startMs + seg.durationMs

        // Filter compound nids whose anchor_ms falls in this segment's range
        // contextNames are sorted by anchor_ms ASC, so we can break early
        const compoundNids: { words: string[]; ctx: ContextName }[] = []
        for (const ctx of this.contextNames) {
            if (ctx.anchor_ms > segEnd) break
            if (ctx.anchor_ms < segStart) continue
            const nidWords = ctx.nid.split(/\s+/).filter(Boolean)
            if (nidWords.length > 1) {
                compoundNids.push({ words: nidWords, ctx })
            }
        }
        if (compoundNids.length === 0) return enriched
        // Sort longest-first to handle overlapping compounds correctly
        compoundNids.sort((a, b) => b.words.length - a.words.length)

        // Merge consecutive tokens matching compound nids by name sequence
        const merged: EnrichedWord[] = []
        let i = 0
        while (i < enriched.length) {
            let didMerge = false
            for (const { words: nidWords, ctx } of compoundNids) {
                if (i + nidWords.length > enriched.length) continue
                // Check name sequence match
                let match = true
                for (let k = 0; k < nidWords.length; k++) {
                    if (enriched[i + k].name.toLowerCase() !== nidWords[k]) {
                        match = false
                        break
                    }
                }
                if (match) {
                    const tokensToMerge = enriched.slice(i, i + nidWords.length)
                    merged.push({
                        rawText: tokensToMerge.map(t => t.rawText).join(''),
                        name: nidWords.join(' '),
                        index: tokensToMerge[0].index,
                        anchorMs: tokensToMerge[0].anchorMs,
                        collected: true,
                        awareness: ctx.awareness as AwarenessStatus | undefined,
                    })
                    i += nidWords.length
                    didMerge = true
                    break
                }
            }
            if (!didMerge) {
                merged.push(enriched[i])
                i++
            }
        }
        return merged
    }


    /**
         * Check if transcript is available
         */
    hasTranscript(): boolean {
        return this.transcript !== null && this.transcript.length > 0
    }

    /**
     * Create VideoAgg from simple video data (without nameContexts)
     * Used when fetching from remote API before DB query
     */
    static fromSimple(video: {
        vid: string
        title: string
        url?: string | null
        cover?: string | null
        lang?: string | null
        transcript_data?: string | null
        archived?: number | null
        tags?: string | null
        create_time?: number | null
        update_time?: number | null
        thumbnail_data?: Uint8Array | null
    }): VideoAgg {
        const now = Math.floor(Date.now() / 1000)
        const row: VideoAggRow = {
            vid: video.vid,
            title: video.title,
            url: video.url ?? null,
            cover: video.cover ?? null,
            lang: video.lang ?? null,
            transcript_data: video.transcript_data ?? null,
            archived: video.archived ?? 0,
            tags: video.tags ?? null,
            create_time: video.create_time ?? now,
            update_time: video.update_time ?? now,
            thumbnail_data: video.thumbnail_data ?? null,
            contextNames: []
        }
        return new VideoAgg(row)
    }
}

//// CREATE NAME


/**
 * NameAgg - Aggregation of names with utility methods
 * Can span multiple videos
 */
export class NameAgg {
    readonly name: NameAggRow;

    constructor(name: NameAggRow) {
        this.name = name;
    }

    /**
     * Filter names by video
     */
    filterByVideo(vid: string) {
        return this.videoContexts.filter(v => v.vid === vid)
    }

    /**
     * Get unique video IDs
     */
    getVideoIds(): string[] {
        return [...new Set(this.videoContexts.map(v => v.vid))]
    }

    // Accessor shortcuts
    get nid(): string { return this.name.nid }
    get awareness() { return this.name.awareness }
    get videoContexts() {
        const contexts = this.name.videoContexts
        if (typeof contexts === 'string') {
            try {
                return JSON.parse(contexts) as NameAggRow['videoContexts']
            } catch {
                return []
            }
        }
        return contexts ?? []
    }
}
