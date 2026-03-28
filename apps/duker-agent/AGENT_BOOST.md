# Agent Boost (AI 大赏) — Autonomous AI Content Payment

> **Status**: Planned — not yet implemented
> **Priority**: High — key differentiator for X Layer hackathon "Agentic Payments" category

## Concept

An AI agent that autonomously evaluates DukerNews post quality and boosts (tips) high-quality content with USDT via x402 protocol — **no human in the loop**.

```
┌──────────────────────────────────────────────────────────────┐
│  AI Agent (Gemini LLM)                                       │
│                                                              │
│  1. Fetch latest posts          → queryClient.getPosts()     │
│  2. Evaluate quality (0-100)    → Gemini API                 │
│  3. Score ≥ 75 → auto boost     → cmdClient.x402Handle()     │
│  4. Log decision + tx hash      → terminal TUI               │
└──────────────────────────────────────────────────────────────┘
```

## Why This Is Truly "Agentic"

| Aspect | Current (Human) | Agent Boost (AI) |
|--------|----------------|-----------------|
| **Decision maker** | User clicks button | LLM evaluates + decides |
| **Payment trigger** | Manual selection | Autonomous, score-based |
| **Loop** | One-shot | Continuous scan cycle |
| **Judging criteria** | "Gasless payments" | **"Autonomous agent payment flow"** ✅ |

## Architecture

### Existing Infrastructure (no changes needed)

- `CmdService.X402Handle` RPC — server-side x402 boost settlement
- `BoostAttentionPayload` proto — boost event data structure
- `QueryService.GetPosts` RPC — fetch posts for evaluation
- `rpc-client.ts` — ConnectRPC client already configured
- `onchainos-cli-api.ts` — OnchainOS agentic wallet already integrated

### New Components Needed

#### 1. `src/services/gemini-evaluator.ts`
LLM content scoring with structured output:

```typescript
const EVAL_PROMPT = `You are a content quality evaluator for a Web3 news platform.
Evaluate this post on a scale of 0-100:
- Relevance to Web3/blockchain/AI (30 points)
- Information quality and depth (30 points)
- Originality and insight (20 points)
- Community value (20 points)

Post Title: "{title}"
Post URL: "{url}"
Post Text: "{text}"

Return JSON: { "score": number, "reason": string }`
```

#### 2. `src/services/agent-boost-service.ts`
Autonomous loop:
- Fetch newest posts via `queryClient.getPosts()`
- Evaluate each via Gemini
- Build `DukerTxReq` with `BOOST_ATTENTION` event type
- Submit via `cmdClient.x402Handle()`
- Track boosted post IDs to avoid duplicates

#### 3. `src/components/AgentBoostView.tsx`
Ink TUI display:
```
┌─ 🤖 Agent Boost (AI 大赏) ──────────────────────────────────┐
│ Budget: $5.00 remaining    Boosted: 3 posts    Skipped: 12  │
├──────────────────────────────────────────────────────────────┤
│ #42 "X Layer launches x402 protocol..."     Score: 92 ✅ $1 │
│ #41 "Random crypto meme..."                 Score: 23 ⏭ skip│
│ #40 "DeFi governance framework review"      Score: 85 ✅ $1 │
│ #38 "Multi-agent architecture patterns"     Score: 88 ✅ $2 │
│                                                              │
│ [EVALUATING] #37 "New ZK rollup benchmark results..."        │
├──────────────────────────────────────────────────────────────┤
│ Esc:stop  r:refresh  +:budget  -:budget                      │
└──────────────────────────────────────────────────────────────┘
```

#### 4. Wire into `app.tsx`
- New view: `{ name: 'auto-boost' }`
- Keyboard shortcut: `a` from home screen

## Safety Guardrails

```typescript
interface AgentBoostConfig {
  maxBoostPerPost: number    // $1 default
  sessionBudget: number      // $5 total per run
  minScore: number           // 75 minimum to trigger boost
  cooldownMs: number         // 5000ms between boosts
  dryRun: boolean            // log decisions without paying
}
```

## Dependencies to Add

```json
{
  "@google/genai": "latest"
}
```

Env vars: `GEMINI_API_KEY` (or reuse `API_KEY`)

## Open Design Questions

1. **Auto-comment?** Agent leaves a comment explaining why it boosted:
   "🤖 AI 大赏: 此帖评分 92/100 — [reason]. 已打赏 $1 USDT"
2. **Wallet**: Use existing OnchainOS agentic wallet or separate hot wallet?
3. **Dry-run flag**: `--dry-run` mode that shows evaluation but doesn't spend
4. **Scheduling**: One-shot scan or continuous loop with interval?

## Demo Script

For the hackathon video, show **side-by-side**:
- Left: Terminal running `duker-agent` in auto-boost mode
- Right: DukerNews webapp showing boosted posts updating in real-time

This proves: "AI agent autonomously pays for content quality on X Layer"
