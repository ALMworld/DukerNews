/**
 * Generate src/data/supported-locales.json
 * Run: npx tsx scripts/gen-locales.ts
 */
import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import clm from 'country-locale-map'

const __dirname = dirname(fileURLToPath(import.meta.url))

function getNativeName(locale: string): string {
    try {
        const bcp47 = locale.replace('_', '-')
        const dn = new Intl.DisplayNames([bcp47], { type: 'language' })
        return dn.of(bcp47) ?? locale
    } catch {
        return locale
    }
}

// Just the locales we support
const LOCALES = ['en', 'zh', 'zh-TW']

// Preferred country for bare locales (no region)
const PREFERRED_COUNTRY: Record<string, string> = { en: 'US', zh: 'CN' }

// Custom native name overrides (when Intl.DisplayNames isn't good enough)
const NATIVE_OVERRIDES: Record<string, string> = {
    zh: '简体中文',
    'zh-TW': '繁體中文',
}

const results = LOCALES.map((locale) => {
    const parts = locale.split(/[-_]/)
    const countryHint = parts.length > 1 ? parts[1].toUpperCase() : PREFERRED_COUNTRY[parts[0]]
    const country = countryHint ? clm.getCountryByAlpha2(countryHint) : null

    return {
        locale,
        flag: country?.emoji ?? '🏳️',
        native: NATIVE_OVERRIDES[locale] ?? getNativeName(locale),
    }
})

const outPath = resolve(__dirname, '../src/data/supported-locales.json')
writeFileSync(outPath, JSON.stringify(results, null, 2) + '\n')
console.log(`✅ Generated ${results.length} locale entries → src/data/supported-locales.json`)
