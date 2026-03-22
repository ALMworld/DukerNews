/**
 * Bagua bilingual text utilities.
 *
 * Convention: text in the author's native language, followed by an English
 * translation separated by a bagua line:
 *
 *   这是中文内容
 *   ☷☶☵☴☳☲☱☰
 *   This is the English version
 *
 * The separator MUST be on its own line (surrounded by \n) to be recognised.
 * If ☷☶☵☴☳☲☱☰ appears inline without newline boundaries it is treated as
 * normal text.
 */

/** Reversed-order bagua trigrams used as the language separator. */
export const BAGUA_SEPARATOR = '☷☶☵☴☳☲☱☰'

/** Full separator including surrounding newlines (for splitting). */
const SEP_PATTERN = '\n' + BAGUA_SEPARATOR + '\n'

/** Parse text that may contain a bagua separator into primary + optional English. */
export function parseBaguaText(text: string): { primary: string; en?: string } {
  const idx = text.indexOf(SEP_PATTERN)
  if (idx === -1) return { primary: text }
  return {
    primary: text.slice(0, idx).trim(),
    en: text.slice(idx + SEP_PATTERN.length).trim() || undefined,
  }
}

/**
 * Build a single string with bagua separator from primary and optional English.
 * If `en` is empty/undefined, returns just the primary text.
 */
export function buildBaguaText(primary: string, en?: string): string {
  if (!en?.trim()) return primary
  return primary.trimEnd() + '\n' + BAGUA_SEPARATOR + '\n' + en.trimStart()
}

/**
 * Get the appropriate display text based on the user's locale.
 *
 * - If userLocale is 'en' and an English portion exists → return English
 * - Otherwise → return the primary (original) text
 */
export function getDisplayText(text: string, userLocale: string): string {
  const { primary, en } = parseBaguaText(text)
  if (userLocale === 'en' && en) return en
  return primary
}
