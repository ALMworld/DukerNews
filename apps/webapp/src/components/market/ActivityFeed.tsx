/**
 * ActivityFeed — Scrollable sidebar activity log.
 *
 * Displays market events as a vertical feed. New entries animate in one by one
 * using CSS keyframes. Intended to be polled from the parent via useQuery
 * refetchInterval.
 */
import { useEffect, useRef, useState } from 'react'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import type { RankedAgentEntry } from '../../client/registry-api'

interface ActivityFeedProps {
    entries: RankedAgentEntry[]
}

const EVENT_TEMPLATES = [
    (name: string, val: string) => ({ icon: '⚡', text: `${name} purchased Neural Link v2`, sub: `• ${val} DUKI` }),
    (name: string, _val: string) => ({ icon: '🚀', text: `New Agent ${name} deployed by System`, sub: '• Level 1 Origin' }),
    (name: string, _val: string) => ({ icon: '💰', text: `${name} updated revenue distribution`, sub: '• +5% Bonus' }),
    (name: string, _val: string) => ({ icon: '🔗', text: `${name} joined the validation layer`, sub: '• Global Sync' }),
    (name: string, _val: string) => ({ icon: '⚠️', text: `Security alert: ${name} temporary suspension`, sub: '• Uptime check' }),
]

interface FeedItem {
    id: string
    icon: string
    text: string
    sub: string
    timeAgo: string
}

function generateFeedItems(entries: RankedAgentEntry[], batchIndex: number): FeedItem[] {
    if (entries.length === 0) return []

    if (batchIndex === 0) {
        // Initial load: generate 6 items representing past activity, newest at the top
        return Array.from({ length: 6 }).map((_, i) => {
            const entry = entries[i % entries.length]
            const name = entry.agent.name || `Agent-${entry.agent.agentId}`
            const val = (entry.credibility / 100).toFixed(2)
            const templateIdx = (Number(entry.agent.agentId) + i) % EVENT_TEMPLATES.length
            const evt = EVENT_TEMPLATES[templateIdx](name, val)

            // i=0 is top item (newest past item), i=5 is bottom item (oldest)
            const timeAgo = i === 0 ? '1 min ago' : `${i * 4 + Math.floor(Math.random() * 3)} min ago`

            return {
                id: `init-${i}`,
                icon: evt.icon,
                text: evt.text,
                sub: evt.sub,
                timeAgo,
            }
        })
    } else {
        // New simulated tx on polling
        const entry = entries[batchIndex % entries.length]
        const name = entry.agent.name || `Agent-${entry.agent.agentId}`
        const val = (entry.credibility / 100).toFixed(2)
        const templateIdx = (Number(entry.agent.agentId) + batchIndex) % EVENT_TEMPLATES.length
        const evt = EVENT_TEMPLATES[templateIdx](name, val)

        return [{
            id: `batch-${batchIndex}`,
            icon: evt.icon,
            text: evt.text,
            sub: evt.sub,
            timeAgo: 'just now',
        }]
    }
}

export function ActivityFeed({ entries }: ActivityFeedProps) {
    const [items, setItems] = useState<FeedItem[]>([])
    const batchRef = useRef(0)

    // Setup auto-animate reference
    const [animationParent] = useAutoAnimate()

    // When entries change, generate new feed items and drip them in
    useEffect(() => {
        if (entries.length === 0) return
        const newItems = generateFeedItems(entries, batchRef.current)
        batchRef.current += 1

        const existingIds = new Set(items.map(i => i.id))
        const fresh = newItems.filter(i => !existingIds.has(i.id))

        // Reverse so we prepend oldest first, leaving newest at the absolute top
        const reversed = [...fresh].reverse()

        let delay = 0
        reversed.forEach((item) => {
            // Unified organic scatter delay (400ms to 1000ms apart)
            delay += Math.floor(Math.random() * 1200) + 800
            setTimeout(() => {
                setItems(prev => [item, ...prev].slice(0, 20))
            }, delay)
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entries])

    const now = new Date()
    const liveTime = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}:${now.getUTCSeconds().toString().padStart(2, '0')}`

    return (
        <div className="flex flex-col rounded-xl border border-border bg-card/60 overflow-hidden flex-1 min-h-[300px]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <div className="flex items-center gap-2">
                    <span className="text-sm">📋</span>
                    <h3 className="m-0 text-xs font-extrabold uppercase tracking-wider text-foreground">
                        Market Activity
                    </h3>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                    <span className="text-[9px] font-mono text-muted-foreground">
                        LIVE: {liveTime}
                    </span>
                </div>
            </div>

            {/* Scrollable feed */}
            <div
                className="flex-1 overflow-y-auto px-3 py-2 scroll-smooth"
                style={{ scrollbarWidth: 'thin' }}
            >
                {items.length === 0 ? (
                    <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
                        Waiting for activity...
                    </div>
                ) : (
                    <div ref={animationParent} className="flex flex-col gap-0.5">
                        {items.map((item) => (
                            <div
                                key={item.id}
                                className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/30"
                            >
                                <span className="mt-0.5 text-sm flex-shrink-0">{item.icon}</span>
                                <div className="min-w-0 flex-1">
                                    <p className="m-0 text-[11px] font-semibold leading-snug text-foreground line-clamp-2">
                                        {item.text}
                                    </p>
                                    <p className="m-0 mt-0.5 text-[10px] text-muted-foreground">
                                        {item.timeAgo} {item.sub}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
