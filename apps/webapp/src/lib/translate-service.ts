/**
 * Translation service.
 *
 * If the source text contains a bagua separator (☷☶☵☴☳☲☱☰) with an English
 * portion and the target locale is 'en', the author-provided English is
 * returned directly — no API call needed.
 *
 * Otherwise falls back to a mock translation (to be replaced with a real API).
 */

import { parseBaguaText } from './bagua-text'

const LOCALE_NAMES: Record<string, string> = {
    en: 'English',
    de: 'Deutsch',
    zh: '中文',
}

export function getLocaleName(locale: string): string {
    return LOCALE_NAMES[locale] ?? locale
}

export async function translateText(
    text: string,
    fromLocale: string,
    toLocale: string,
): Promise<string> {
    // If text has a bagua English portion and target is English, use it directly
    if (toLocale === 'en') {
        const { en } = parseBaguaText(text)
        if (en) return en
    }

    // If text has a bagua English portion and translating FROM English, use the primary
    if (fromLocale === 'en') {
        const { primary } = parseBaguaText(text)
        if (primary !== text) return primary
    }

    // Simulate network delay (mock — replace with real API)
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 400))

    const fromName = getLocaleName(fromLocale)
    return `[Translated from ${fromName}] ${parseBaguaText(text).primary}`
}

