/**
 * Translation fetcher — the real HTTP call goes here.
 * Consumed by useQueries in CommentThread (bulk) and any future
 * single-comment useQuery hook.
 *
 * Currently a mock; replace the fetch block with your real API call.
 */

const LOCALE_NAMES: Record<string, string> = {
    en: 'English',
    de: 'Deutsch',
    zh: '中文',
    ja: '日本語',
    ko: '한국어',
    fr: 'Français',
    es: 'Español',
}

export function getLocaleName(locale: string): string {
    return LOCALE_NAMES[locale] ?? locale
}

/**
 * Translate `text` from `fromLocale` into `toLocale`.
 * Replace the mock implementation below with a real API call, e.g.:
 *
 *   const res = await fetch('/api/translate', {
 *     method: 'POST',
 *     body: JSON.stringify({ text, fromLocale, toLocale }),
 *   })
 *   return (await res.json()).translatedText
 */
export async function translateText(
    text: string,
    fromLocale: string,
    toLocale: string,
): Promise<string> {
    // ── Mock ─────────────────────────────────────────────────────────────────
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 400))
    const from = getLocaleName(fromLocale)
    const to = getLocaleName(toLocale)
    return `[${from} → ${to}] ${text}`
    // ─────────────────────────────────────────────────────────────────────────
}
