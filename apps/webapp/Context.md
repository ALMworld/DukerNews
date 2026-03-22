# Duker News — Project Context

> A Hacker-News-style web3 community board built with **TanStack Start** (React 19), deployed on **Cloudflare Workers**.
> "DUKI" stands for _Decentralized Universal Kindness Initiative_.

---

## Quick Start

```bash
pnpm install
pnpm dev          # → http://localhost:3000
pnpm build        # production build (Cloudflare)
pnpm deploy       # wrangler deploy
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | TanStack Start (TanStack Router + React 19) |
| SSR / Hosting | Cloudflare Workers (via `@cloudflare/vite-plugin`) |
| Styling | TailwindCSS v4 (`@tailwindcss/vite`) |
| State | React `useState` / URL search params (no global store) |
| Data | In-memory mock data (`mock-data.ts` → `http-service.ts`) |
| Routing | File-based: `src/routes/` with TanStack Router conventions |
| Wallet | Reown AppKit + Wagmi (client-only, dynamically imported for SSR safety) |
| i18n | Custom `LocaleProvider` context — supports `en`, `de`, `zh` |
| Build | Vite 7 + `vite-tsconfig-paths` |

---

## Directory Structure

```
src/
├── routes/                  # File-based routing (TanStack Router)
│   ├── __root.tsx           # Root layout: <html>, <head>, LocaleProvider, Header, Footer
│   ├── index.tsx            # Homepage: post list with sort/filter/search/pagination
│   ├── post.$id.tsx         # Post detail: post body, translation, comments, comment form
│   └── submit.tsx           # Submit page: new link or pitch post form
│
├── components/
│   ├── Header.tsx           # Top nav: logo, nav links, search, locale selector, wallet btn
│   ├── Footer.tsx           # Footer links and tagline
│   ├── PostItem.tsx         # Single post row (upvote, title, meta, domain)
│   ├── CommentThread.tsx    # Recursive tree of comments with reply forms + translate
│   └── CommentLocaleToggle.tsx  # Binary locale pill toggle for comment/reply inputs
│
├── lib/
│   ├── types.ts             # Core types: Post, Comment, PostType, SubmitPostInput
│   ├── http-service.ts      # Mock HTTP API (getPosts, getPost, getComments, upvotePost, submitPost, addComment)
│   ├── mock-data.ts         # 20 mock posts + nested comments (multi-locale)
│   ├── locale-context.tsx   # LocaleProvider, useLocale, SupportedLocale, LOCALE_LABELS/FLAGS
│   ├── translate-service.ts # Mock translateText() + getLocaleName()
│   ├── appkit.tsx           # Client-only <WalletButton> wrapper (dynamic import)
│   ├── appkit-client.tsx    # Reown AppKit + Wagmi config (browser-only)
│   └── utils.ts             # cn() helper (clsx + tailwind-merge)
│
├── integrations/
│   └── tanstack-query/      # TanStack Query root provider
│
├── styles.css               # Global CSS: custom properties, dark theme, Hacker News aesthetic
├── router.tsx               # TanStack Router creation
├── routeTree.gen.ts         # Auto-generated route tree
└── server.ts                # Cloudflare Workers entry point
```

---

## Data Model

```typescript
type PostType = 'link' | 'pitch'

interface Post {
  id: number
  title: string
  url?: string           // links only
  domain?: string        // extracted from url
  text?: string          // pitch / body text
  points: number
  author: string
  createdAt: string      // ISO 8601
  commentCount: number
  type: PostType
  locale: string         // 'en' | 'de' | 'zh'
}

interface Comment {
  id: number
  postId: number
  parentId: number | null
  author: string
  text: string
  createdAt: string
  locale: string
  children: Comment[]    // nested tree
}
```

---

## Key Features

### Internationalization (i18n)
- **User locale** is stored in `localStorage` (`duki-locale`), auto-detected from browser on first visit
- Three supported locales: `en`, `de`, `zh`
- Locale selector in the Header with flag icons and labels
- Posts and comments each have a `locale` field
- **Translation**: mock `translateText()` prefixes text with `[Translated from ...]`
- **Translate buttons** on posts and comments when `post.locale !== userLocale`
- **Comment locale toggle**: when creating a comment/reply on a post in a different language, a pill toggle appears at the bottom-right of the textarea. Default locale flips based on whether the user is viewing translated content.

### Mock API (`http-service.ts`)
All data lives in-memory — no backend. The `httpService` object exposes:
- `getPosts({ type?, page?, perPage?, sort?, q? })` — filter, search, sort, paginate
- `getPost(id)` — single post by ID
- `getComments(postId)` — flat → nested comment tree for a post
- `upvotePost(id)` — increment points
- `submitPost(input)` — create a new post
- `addComment(postId, parentId, text, locale)` — add comment or reply
- `timeAgo(dateStr)` — relative time formatting

### Wallet Connect
- Reown AppKit + Wagmi adapter, configured for Ethereum mainnet
- **SSR-safe**: `appkit-client.tsx` is dynamically imported only in the browser via `appkit.tsx`, preventing SSR crashes from `window`-dependent code

---

## Routing

| Path | Route File | Description |
|------|-----------|-------------|
| `/` | `index.tsx` | Homepage — post list. Query params: `?type=pitch`, `?sort=newest`, `?q=term`, `?page=2` |
| `/post/:id` | `post.$id.tsx` | Post detail — full text, translate button, comments, comment form |
| `/submit` | `submit.tsx` | Submit new post — title, URL/text, type selector, locale selector |

---

## Styling Conventions

- **Dark theme** with custom CSS properties defined in `styles.css`
- Key variables: `--background`, `--foreground`, `--border`, `--input`, `--ring`, `--meta-color`, `--link-color`
- Brand palette: `--duki-*` (100–900) — purple gradient
- Components use inline `style={{}}` with CSS variable references + Tailwind utility classes
- Font: Inter (loaded from Google Fonts)

---

## SSR Considerations

- TanStack Start renders on the server (Cloudflare Workers)
- Any browser-only code (`window`, `localStorage`, `navigator`) must be guarded:
  - `if (typeof window === 'undefined')` checks
  - Dynamic imports with `React.lazy` for client-only modules
- Wallet (AppKit/Wagmi) is fully isolated behind dynamic import in `appkit.tsx`
- `LocaleProvider` initializes to `'en'` during SSR, then hydrates from `localStorage`

---

## Development Notes

- **Package manager**: pnpm
- **Dev server**: `pnpm dev` → Vite on port 3000
- **Cloudflare plugin** is only active during build (`mode !== 'development'`)
- **Path alias**: `@/` → `src/` (via tsconfig paths)
- Mock data simulates ~50ms latency via `delay()` in `http-service.ts`
- All mock posts use realistic web3/DAO/public-goods themes
