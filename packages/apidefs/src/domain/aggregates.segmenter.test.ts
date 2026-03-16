import { describe, it, expect } from 'vitest'
import { TranscriptAgg, TranscriptData } from './aggregates'

function makeData(texts: string[], lang: string): TranscriptData {
    return {
        vid: 'test-vid',
        lang,
        startMs: texts.map((_, i) => i * 5000),
        durationMs: texts.map(() => 4000),
        texts,
    }
}

describe('TranscriptAgg segmenter', () => {
    describe('English (word granularity)', () => {
        it('attaches punctuation to rawText while keeping name clean', () => {
            const agg = new TranscriptAgg(makeData(['Hello, world!'], 'en'))
            const tokens = agg.segments[0].tokens

            expect(tokens.length).toBe(2)
            // "Hello" should have trailing ", " attached
            expect(tokens[0].name).toBe('Hello')
            expect(tokens[0].rawText).toBe('Hello, ')
            // "world" should have trailing "!" attached
            expect(tokens[1].name).toBe('world')
            expect(tokens[1].rawText).toBe('world!')
        })

        it('preserves text roundtrip: joining rawText equals original', () => {
            const text = 'This is a test, with punctuation!'
            const agg = new TranscriptAgg(makeData([text], 'en'))
            const reconstructed = agg.segments[0].tokens.map(t => t.rawText).join('')
            expect(reconstructed).toBe(text)
        })

        it('handles leading punctuation', () => {
            const text = '"Hello" world'
            const agg = new TranscriptAgg(makeData([text], 'en'))
            const tokens = agg.segments[0].tokens
            // Leading quote should be prepended to first token
            expect(tokens[0].rawText).toContain('"')
            expect(tokens[0].name).toBe('Hello')
        })

        it('handles empty text', () => {
            const agg = new TranscriptAgg(makeData([''], 'en'))
            expect(agg.segments[0].tokens).toEqual([])
        })
    })

    describe('Chinese (grapheme granularity)', () => {
        it('segments each character as a separate token', () => {
            const agg = new TranscriptAgg(makeData(['你好世界'], 'zh'))
            const tokens = agg.segments[0].tokens

            expect(tokens.length).toBe(4)
            expect(tokens[0].name).toBe('你')
            expect(tokens[1].name).toBe('好')
            expect(tokens[2].name).toBe('世')
            expect(tokens[3].name).toBe('界')
        })

        it('attaches Chinese punctuation to rawText', () => {
            const text = '你好，世界！'
            const agg = new TranscriptAgg(makeData([text], 'zh'))
            const tokens = agg.segments[0].tokens

            // 好 should have trailing ， attached
            const haoToken = tokens.find(t => t.name === '好')
            expect(haoToken?.rawText).toBe('好，')

            // 界 should have trailing ！ attached
            const jieToken = tokens.find(t => t.name === '界')
            expect(jieToken?.rawText).toBe('界！')

            // rawText roundtrip
            const reconstructed = tokens.map(t => t.rawText).join('')
            expect(reconstructed).toBe(text)
        })
    })

    describe('Japanese (grapheme granularity)', () => {
        it('segments each character separately', () => {
            const agg = new TranscriptAgg(makeData(['こんにちは'], 'ja'))
            const tokens = agg.segments[0].tokens
            expect(tokens.length).toBe(5)
            expect(tokens.map(t => t.name).join('')).toBe('こんにちは')
        })
    })

    describe('Korean (grapheme granularity)', () => {
        it('segments each character separately', () => {
            const agg = new TranscriptAgg(makeData(['안녕하세요'], 'ko'))
            const tokens = agg.segments[0].tokens
            expect(tokens.length).toBe(5)
            expect(tokens.map(t => t.name).join('')).toBe('안녕하세요')
        })
    })

    describe('anchorMs calculation', () => {
        it('distributes anchor times across tokens', () => {
            const agg = new TranscriptAgg(makeData(['one two three'], 'en'))
            const tokens = agg.segments[0].tokens

            expect(tokens.length).toBe(3)
            // First token should start at segment start
            expect(tokens[0].anchorMs).toBe(0)
            // Subsequent tokens should have increasing anchorMs
            expect(tokens[1].anchorMs).toBeGreaterThan(tokens[0].anchorMs)
            expect(tokens[2].anchorMs).toBeGreaterThan(tokens[1].anchorMs)
        })
    })
})

// ── VideoAgg compound name merge ──────────────────────────────────

import { VideoAgg } from './aggregates'
import type { VideoAggRow } from './querys'

function makeVideoAggRow(texts: string[], contextNames: Array<{ nid: string; anchor_ms: number; awareness?: number }>): VideoAggRow {
    const transcriptData: TranscriptData = {
        vid: 'test-vid',
        lang: 'en',
        startMs: texts.map((_, i) => i * 5000),
        durationMs: texts.map(() => 4000),
        texts,
    }
    return {
        vid: 'test-vid',
        title: 'Test',
        lang: 'en',
        cover: null,
        url: null,
        transcript_data: JSON.stringify(transcriptData),
        thumbnail_data: null,
        archived: null,
        tags: null,
        create_time: '',
        update_time: '',
        contextNames: contextNames.map(ctx => ({
            ...ctx,
            name: ctx.nid,
            start_ms: 0,
            end_ms: 5000,
            surrounding: '',
            awareness_time: null,
            awareness_time_day: null,
            review_time: null,
            review_count: null,
            notes: null,
            name_create_time: '',
            name_update_time: '',
            context_create_time: '',
        })),
    } as unknown as VideoAggRow
}

describe('VideoAgg compound name merge', () => {
    it('merges consecutive tokens matching a compound nid into one EnrichedWord', () => {
        const row = makeVideoAggRow(
            ['Daddy Pig is here'],
            [{ nid: 'daddy pig', anchor_ms: 0 }]
        )
        const agg = new VideoAgg(row)
        const enriched = agg.getEnrichedWordsAt(0)

        // "Daddy Pig" should be merged into one word
        const daddyPig = enriched.find(w => w.name === 'daddy pig')
        expect(daddyPig).toBeDefined()
        expect(daddyPig!.collected).toBe(true)
        expect(daddyPig!.rawText).toContain('Daddy')
        expect(daddyPig!.rawText).toContain('Pig')

        // "is" and "here" should remain separate
        expect(enriched.find(w => w.name === 'is')).toBeDefined()
        expect(enriched.find(w => w.name === 'here')).toBeDefined()

        // Total count: "daddy pig" (1) + "is" (1) + "here" (1) = 3
        expect(enriched.length).toBe(3)
    })

    it('does not merge non-adjacent tokens', () => {
        const row = makeVideoAggRow(
            ['Daddy is a Pig'],
            [{ nid: 'daddy pig', anchor_ms: 0 }]
        )
        const agg = new VideoAgg(row)
        const enriched = agg.getEnrichedWordsAt(0)

        // "Daddy" and "Pig" are not adjacent, no merge
        expect(enriched.find(w => w.name === 'daddy pig')).toBeUndefined()
        expect(enriched.length).toBe(4) // Daddy, is, a, Pig
    })

    it('handles nid with newline separator', () => {
        const row = makeVideoAggRow(
            ['Daddy Pig is here'],
            [{ nid: 'daddy\npig', anchor_ms: 0 }]
        )
        const agg = new VideoAgg(row)
        const enriched = agg.getEnrichedWordsAt(0)

        // Should still merge because nid is split by \s+
        const daddyPig = enriched.find(w => w.name === 'daddy pig')
        expect(daddyPig).toBeDefined()
        expect(daddyPig!.collected).toBe(true)
    })
})
