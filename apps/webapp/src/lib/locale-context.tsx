'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import supportedLocales from '../data/supported-locales.json'
import {
    setLocale as paraglideSetLocale,
    isLocale as paraglideIsLocale,
    getLocale as paraglideGetLocale,
    overwriteGetLocale,
    baseLocale,
} from '../paraglide/runtime.js'

export type LocaleEntry = {
    locale: string
    flag: string
    native: string
}

export const LOCALES: LocaleEntry[] = supportedLocales as LocaleEntry[]

interface LocaleContextValue {
    locale: string
    setLocale: (l: string) => void
    currentEntry: LocaleEntry
}

const defaultEntry = LOCALES.find(e => e.locale === 'en') || LOCALES[0]

const LocaleContext = createContext<LocaleContextValue>({
    locale: defaultEntry.locale,
    setLocale: () => { },
    currentEntry: defaultEntry,
})

function findEntry(code: string): LocaleEntry {
    let entry = LOCALES.find(e => e.locale === code)
    if (entry) return entry
    const base = code.split(/[-_]/)[0]
    entry = LOCALES.find(e => e.locale === base)
    if (entry) return entry
    return defaultEntry
}

/** Sync a locale code to Paraglide (if it's a supported Paraglide locale). */
function syncToParaglide(code: string) {
    const base = code.split(/[-_]/)[0]
    if (paraglideIsLocale(base)) {
        paraglideSetLocale(base as any, { reload: false })
    }
}

// On the client, force paraglide to return 'en' during the initial render
// so it matches SSR output. The real locale is restored in useEffect.
let _originalGetLocale: typeof paraglideGetLocale | null = null
if (typeof window !== 'undefined') {
    _originalGetLocale = paraglideGetLocale
    overwriteGetLocale(() => baseLocale as any)
}

export function LocaleProvider({ children }: { children: ReactNode }) {
    const [locale, setLocale] = useState<string>(defaultEntry.locale)

    // Localization disabled — always use English until translations are ready.
    // Uncomment the block below to re-enable browser detection + localStorage.
    useEffect(() => {
        if (_originalGetLocale) {
            overwriteGetLocale(_originalGetLocale as any)
            _originalGetLocale = null
        }

        // const saved = localStorage.getItem('duki-locale')
        // let detected = defaultEntry.locale
        // if (saved && LOCALES.find(e => e.locale === saved)) {
        //     detected = saved
        // } else {
        //     const browserLang = navigator.language.replace('_', '-')
        //     detected = findEntry(browserLang).locale
        // }
        // syncToParaglide(detected)
        // document.documentElement.lang = detected
        // if (detected !== defaultEntry.locale) {
        //     setLocale(detected)
        // }

        syncToParaglide('en')
        document.documentElement.lang = 'en'
    }, [])

    const handleSetLocale = (l: string) => {
        syncToParaglide(l)
        setLocale(l)
        if (typeof window !== 'undefined') {
            document.documentElement.lang = l
            localStorage.setItem('duki-locale', l)
        }
    }

    const currentEntry = findEntry(locale)

    return (
        <LocaleContext.Provider value={{ locale, setLocale: handleSetLocale, currentEntry }}>
            {children}
        </LocaleContext.Provider>
    )
}

export function useLocale() {
    return useContext(LocaleContext)
}

// Backwards compat for submit.tsx, CommentLocaleToggle, etc.
export type SupportedLocale = string
export const LOCALE_LABELS: Record<string, string> = Object.fromEntries(
    LOCALES.map(e => [e.locale, e.native])
)
