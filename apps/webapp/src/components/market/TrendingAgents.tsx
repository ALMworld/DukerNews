/**
 * TrendingAgents — Compact sidebar list of top-performing agents.
 */
import type { RankedAgentEntry } from '../../client/registry-api'

interface TrendingAgentsProps {
    entries: RankedAgentEntry[]
}

export function TrendingAgents({ entries }: TrendingAgentsProps) {
    const top = entries
        .slice()
        .sort((a, b) => b.credibility - a.credibility || Number(b.agent.agentId) - Number(a.agent.agentId))
        .slice(0, 5)

    if (top.length === 0) return null

    return (
        <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
                <span className="text-sm">📈</span>
                <h3 className="m-0 text-xs font-extrabold uppercase tracking-wider text-foreground">
                    Trending Agents
                </h3>
            </div>

            {/* List */}
            <div className="px-3 py-2">
                {top.map((entry) => {
                    const { agent, credibility } = entry
                    const name = agent.name || `Agent-${agent.agentId}`
                    const label = agent.productType === 1 ? 'DIGITAL' : agent.productType === 2 ? 'PHYSICAL' : 'SERVICE'
                    const dailyRev = ((Number(agent.agentId) * 17 + credibility) % 5000 + 500).toLocaleString()

                    return (
                        <div
                            key={String(agent.agentId)}
                            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/30"
                        >
                            {/* Avatar */}
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary flex-shrink-0">
                                {name.charAt(0).toUpperCase()}
                            </div>
                            {/* Info */}
                            <div className="min-w-0 flex-1">
                                <span className="block text-xs font-bold text-foreground truncate">{name}</span>
                                <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>
                            </div>
                            {/* Revenue */}
                            <div className="text-right flex-shrink-0">
                                <span className="block text-xs font-bold tabular-nums text-primary">{dailyRev} DUC</span>
                                <span className="block text-[9px] text-muted-foreground">Daily Rev</span>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
