import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react'
import enData from '../locales/en.json'
import zhCNData from '../locales/zh-CN.json'
import zhTWData from '../locales/zh-TW.json'

// ── Supported locales ──
export type Locale = 'en' | 'zhCN' | 'zhTW'

// ── Translation type (inferred from JSON) ──
export type Translations = typeof enData

// ── Load from JSON ──
const translations: Record<Locale, Translations> = {
  en: enData,
  zhCN: zhCNData,
  zhTW: zhTWData,
}

// ── Locale detection ──
function detectLocale(): Locale {
  const saved = localStorage.getItem('duki-locale') as Locale | null
  if (saved && translations[saved]) return saved

  const lang = navigator.language || 'en'
  if (lang.startsWith('zh')) {
    if (lang.includes('TW') || lang.includes('Hant')) return 'zhTW'
    return 'zhCN'
  }
  return 'en'
}

/** Map miniapp locale to dao-bagua-diagram locale key ('en' | 'zh') */
export function toDiagramLocale(locale: Locale): string {
  return locale.startsWith('zh') ? 'zh' : 'en'
}

// ── Context ──
interface LocaleContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: Translations
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: translations.en,
})

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en')

  useEffect(() => {
    setLocaleState(detectLocale())
  }, [])

  const setLocale = (l: Locale) => {
    setLocaleState(l)
    localStorage.setItem('duki-locale', l)
  }

  const t = useMemo(() => translations[locale], [locale])

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  return useContext(LocaleContext)
}
