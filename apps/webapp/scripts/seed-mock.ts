/**
 * seed-mock.ts — Seed 8 mock works (product/app) posts with 8 comments each.
 *
 * Usage:
 *   DUKER_URL=https://news.alllivesmatter.world npx tsx scripts/seed-mock.ts
 *   npx tsx scripts/seed-mock.ts   # defaults to localhost:3000
 */

const BASE_URL = process.env.DUKER_URL || 'http://localhost:3000'

interface MockItem {
    id: number
    author: string
    title: string
    url: string
    text: string
    points: number
    type: string
    created_at: string
    created_at_i: number
    children: MockItem[]
}

const now = Math.floor(Date.now() / 1000)

// Helper to create a comment node
function c(id: number, author: string, text: string, offset: number, children: MockItem[] = []): MockItem {
    return { id, author, title: null as any, url: '', text, points: Math.floor(Math.random() * 8) + 1, type: 'comment', created_at: '', created_at_i: now - offset, children }
}

// All IDs are even so the seed-service generates WorksPostData blobs
const posts: MockItem[] = [
    {
        id: 900010, author: 'frank1',
        title: '[MOCK] EcoTrack — Carbon Footprint Calculator for Web3 Communities',
        url: 'https://ecotrack.example.com', text: '',
        points: 42, type: 'story', created_at: '', created_at_i: now - 3600,
        children: [
            c(900110, 'frank2', 'Just tried EcoTrack for our DAO. The on-chain carbon offset integration is brilliant — you can buy verified credits directly from the dashboard.', 3500, [
                c(900112, 'frank3', 'How do they verify the carbon credits? Is there an oracle or is it manual attestation?', 3400),
            ]),
            c(900114, 'frank4', 'The UX is surprisingly clean for a web3 product. Wallet connect flow took 3 seconds and I could see my footprint immediately.', 3300, [
                c(900116, 'frank1', 'Thanks! We spent months on the onboarding. Every new user gets an auto-generated footprint estimate based on their on-chain activity.', 3200),
            ]),
            c(900118, 'frank5', 'Any plans to integrate with Layer 2 chains? Mainnet transactions skew the footprint numbers since they cost more gas.', 3100, [
                c(900120, 'frank6', 'They already support Arbitrum and Optimism. Check the settings page — you can add multiple chains.', 3000),
            ]),
            c(900122, 'frank7', 'Love the gamification aspect. Our community started competing on who has the lowest monthly footprint.', 2900, [
                c(900124, 'frank8', 'We added leaderboards last week! DAOs can now run carbon reduction challenges with token rewards.', 2800),
            ]),
        ],
    },
    {
        id: 900020, author: 'frank2',
        title: '[MOCK] MindfulAI — AI-Powered Mental Health Companion App',
        url: 'https://mindfulai.example.com', text: '',
        points: 67, type: 'story', created_at: '', created_at_i: now - 7200,
        children: [
            c(900210, 'frank5', 'Been using MindfulAI for 3 weeks. The daily check-in prompts are genuinely helpful, not just generic affirmations.', 7100, [
                c(900212, 'frank1', 'The personalization engine learns your patterns. After a week it started suggesting breathing exercises right when I usually feel stressed.', 7000),
            ]),
            c(900214, 'frank3', 'How does data privacy work? I am cautious about sharing mental health data with any app.', 6900, [
                c(900216, 'frank2', 'All data is end-to-end encrypted and stored locally. We never see your conversations. You can export and delete everything anytime.', 6800),
            ]),
            c(900218, 'frank4', 'The mood tracking visualizations are beautiful. I can see trends over weeks and months at a glance.', 6700, [
                c(900220, 'frank8', 'Try the weekly report feature — it correlates your mood with sleep, exercise, and weather data.', 6600),
            ]),
            c(900222, 'frank6', 'Is this meant to replace therapy? I would be concerned about people relying on AI instead of professionals.', 6500, [
                c(900224, 'frank7', 'They are very clear about this — the app suggests professional help when it detects serious patterns. It is a supplement, not a replacement.', 6400),
            ]),
        ],
    },
    {
        id: 900030, author: 'frank3',
        title: '[MOCK] FarmLink — Connecting Local Farmers Directly with Consumers',
        url: 'https://farmlink.example.com', text: '',
        points: 38, type: 'story', created_at: '', created_at_i: now - 10800,
        children: [
            c(900310, 'frank1', 'Downloaded FarmLink last month and now I get fresh produce delivered every Thursday from a farm 20 miles away. The prices are better than the supermarket.', 10700, [
                c(900312, 'frank4', 'Same experience here. The CSA box subscription model works perfectly. No more wilted lettuce from the grocery store.', 10600),
            ]),
            c(900314, 'frank6', 'I am a small farmer and this platform actually pays fair prices. Other marketplaces take 30-40% — FarmLink takes only 8%.', 10500, [
                c(900316, 'frank3', 'That was our #1 design goal. Farmers keep most of the revenue. We make money on volume, not margins.', 10400),
            ]),
            c(900318, 'frank2', 'The recipe suggestions based on what is in season this week are a nice touch. Makes meal planning so much easier.', 10300, [
                c(900320, 'frank8', 'The "cook what is fresh" approach changed how I think about food. Less waste, better flavor.', 10200),
            ]),
            c(900322, 'frank5', 'How does the logistics work for perishable items? Do farmers handle their own delivery?', 10100, [
                c(900324, 'frank7', 'They use shared cold-chain hubs. Multiple farmers drop off at a central point, then one truck does the last mile. Smart routing.', 10000),
            ]),
        ],
    },
    {
        id: 900040, author: 'frank4',
        title: '[MOCK] CodeMentor — Peer-to-Peer Code Review Marketplace',
        url: 'https://codementor.example.com', text: '',
        points: 55, type: 'story', created_at: '', created_at_i: now - 14400,
        children: [
            c(900410, 'frank7', 'Got my smart contract reviewed by a senior auditor in 2 hours through CodeMentor. Found 3 critical issues I completely missed.', 14300, [
                c(900412, 'frank2', 'The reputation system is what makes it work. Top reviewers have skin in the game — their score drops if they miss things.', 14200),
            ]),
            c(900414, 'frank5', 'Pricing is transparent and fair. You set your budget, reviewers bid, and you pick based on their track record.', 14100, [
                c(900416, 'frank1', 'We also added AI-assisted pre-screening. The AI catches obvious issues first so human reviewers focus on logic and architecture.', 14000),
            ]),
            c(900418, 'frank8', 'Love that they support 20+ languages. Got a Rust review from someone who actually works on Solana core.', 13900, [
                c(900420, 'frank3', 'The language-specific matching is key. My Python review was done by a Django contributor who spotted framework-specific anti-patterns.', 13800),
            ]),
            c(900422, 'frank6', 'The async review format works better than live pairing for deep code review. Reviewers take time to think.', 13700, [
                c(900424, 'frank4', 'Exactly our thinking. We also offer live sessions for architecture discussions, but async is the default for code quality.', 13600),
            ]),
        ],
    },
    {
        id: 900050, author: 'frank5',
        title: '[MOCK] SolarShare — Community Solar Panel Investment Platform',
        url: 'https://solarshare.example.com', text: '',
        points: 63, type: 'story', created_at: '', created_at_i: now - 18000,
        children: [
            c(900510, 'frank3', 'Invested $500 in a community solar project through SolarShare. Getting monthly energy credits on my electricity bill now.', 17900, [
                c(900512, 'frank5', 'That is the beauty of fractional ownership. You do not need a roof to benefit from solar. Even renters can participate.', 17800),
            ]),
            c(900514, 'frank1', 'The real-time dashboard showing exactly how much energy your panels generated today is addictive to watch.', 17700, [
                c(900516, 'frank6', 'On a sunny day last week my share generated enough to offset my entire apartment electricity cost. Felt amazing.', 17600),
            ]),
            c(900518, 'frank2', 'How is the ROI compared to traditional solar panel installation? My rough math says it is comparable.', 17500, [
                c(900520, 'frank8', 'Slightly lower ROI but zero maintenance hassle and much lower entry cost. The convenience factor is huge.', 17400),
            ]),
            c(900522, 'frank4', 'Are the energy credits transferable? Could I sell my share if I move to a different utility zone?', 17300, [
                c(900524, 'frank7', 'Yes — there is a secondary marketplace. Shares typically sell within a week. Liquidity is surprisingly good.', 17200),
            ]),
        ],
    },
    {
        id: 900060, author: 'frank6',
        title: '[MOCK] LangBridge — Real-Time Translation Tool for Remote Teams',
        url: 'https://langbridge.example.com', text: '',
        points: 44, type: 'story', created_at: '', created_at_i: now - 21600,
        children: [
            c(900610, 'frank4', 'Our team spans 5 countries and 4 languages. LangBridge made our standups actually productive — everyone speaks their native language now.', 21500, [
                c(900612, 'frank1', 'The latency is impressive. Less than 500ms for speech-to-speech translation. You barely notice the delay.', 21400),
            ]),
            c(900614, 'frank7', 'Tried it for a customer support use case. Japanese customers talking to English-speaking agents — worked flawlessly.', 21300, [
                c(900616, 'frank3', 'Technical terminology handling is surprisingly good. It correctly translated "smart contract" context-aware into Chinese.', 21200),
            ]),
            c(900618, 'frank8', 'The Slack integration is the killer feature. Automatic translation of messages in channels — no copy-pasting to Google Translate.', 21100, [
                c(900620, 'frank5', 'We also have a Notion plugin coming next month. Documentation in any language, readable by everyone.', 21000),
            ]),
            c(900622, 'frank2', 'How many languages are supported? I need Bahasa Indonesia and Vietnamese for our Southeast Asia team.', 20900, [
                c(900624, 'frank6', '42 languages including Bahasa and Vietnamese. We are adding 10 more African languages next quarter.', 20800),
            ]),
        ],
    },
    {
        id: 900070, author: 'frank7',
        title: '[MOCK] SkillForge — Learn-to-Earn Education Platform with NFT Certificates',
        url: 'https://skillforge.example.com', text: '',
        points: 51, type: 'story', created_at: '', created_at_i: now - 25200,
        children: [
            c(900710, 'frank2', 'Completed the Solidity course on SkillForge. The NFT certificate actually got recognized by two companies during my job search.', 25100, [
                c(900712, 'frank5', 'On-chain credentials are the future. No more lying on resumes — your skills are verifiably proven.', 25000),
            ]),
            c(900714, 'frank8', 'The learn-to-earn model is genius. I earned $30 worth of tokens while learning Rust. It kept me motivated to finish.', 24900, [
                c(900716, 'frank1', 'Where do the rewards come from? Is it sustainable or just VC-subsidized growth hacking?', 24800),
            ]),
            c(900718, 'frank6', 'Course quality is excellent. The ZK proofs module was created by actual Polygon engineers.', 24700, [
                c(900720, 'frank3', 'They verify instructor credentials too. Only industry practitioners with 5+ years experience can create courses.', 24600),
            ]),
            c(900722, 'frank4', 'The peer review system for projects is great. You learn from reviewing others code as much as writing your own.', 24500, [
                c(900724, 'frank7', 'That was inspired by university peer review. We found it doubles retention rates compared to solo learning.', 24400),
            ]),
        ],
    },
    {
        id: 900080, author: 'frank8',
        title: '[MOCK] GiveDAO — Transparent Charity Donations on the Blockchain',
        url: 'https://givedao.example.com', text: '',
        points: 47, type: 'story', created_at: '', created_at_i: now - 28800,
        children: [
            c(900810, 'frank1', 'Donated to a clean water project through GiveDAO. I can track every dollar on-chain — from my wallet to the contractor payment. Zero black box.', 28700, [
                c(900812, 'frank3', 'This is what charity should look like. Full transparency from donor to beneficiary. The overhead is published on-chain too.', 28600),
            ]),
            c(900814, 'frank6', 'The impact reporting is incredible. Monthly updates with photos, GPS coordinates, and verified milestones.', 28500, [
                c(900816, 'frank8', 'We use Chainlink oracles to verify milestone completion. Local NGOs submit proof, oracles validate, funds release automatically.', 28400),
            ]),
            c(900818, 'frank4', 'Smart contract-controlled fund release is the key innovation here. Donations only disburse when milestones are met.', 28300, [
                c(900820, 'frank2', 'It also solves the overhead problem. Admin costs are capped at 5% by the smart contract — cannot be changed without governance vote.', 28200),
            ]),
            c(900822, 'frank5', 'The tax receipt integration is seamless. At year end I got a PDF with all my donation receipts auto-generated.', 28100, [
                c(900824, 'frank7', 'Multi-chain support would be great. Right now it is Ethereum only. Many donors prefer low-fee chains.', 28000),
            ]),
        ],
    },
]

async function main() {
    console.log(`🌱 Seeding 8 mock works posts to ${BASE_URL}/api/seed\n`)

    for (let i = 0; i < posts.length; i++) {
        const post = posts[i]
        console.log(`[${i + 1}/8] "${post.title}" by ${post.author}`)

        const resp = await fetch(`${BASE_URL}/api/seed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item: post, maxComments: 999 }),
        })

        if (!resp.ok) {
            const err = await resp.text()
            console.error(`  ❌ ${resp.status}: ${err}`)
            continue
        }

        const result = await resp.json() as any
        if (result.skipped) {
            console.log(`  ⏭️  Already exists (post #${result.postId})`)
        } else {
            console.log(`  ✅ Post #${result.postId} with ${result.commentsImported} comments`)
        }
    }

    console.log('\n✨ Done!')
}

main().catch(err => {
    console.error('Fatal:', err)
    process.exit(1)
})
