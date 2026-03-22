import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


/** Format a date string, timestamp, or bigint to locale-aware relative time */
const rtfCache = new Map<string, Intl.RelativeTimeFormat>()
function getRtf(locale: string): Intl.RelativeTimeFormat {
  let rtf = rtfCache.get(locale)
  if (!rtf) {
    rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'narrow' })
    rtfCache.set(locale, rtf)
  }
  return rtf
}

const TIME_DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60 * 60 * 24, unit: 'day' },
  { amount: 60 * 60, unit: 'hour' },
  { amount: 60, unit: 'minute' },
]

export function timeAgo(dateStr: string | number | bigint, locale = 'en'): string {
  const rtf = getRtf(locale)
  const ts = typeof dateStr === 'bigint' ? Number(dateStr) : typeof dateStr === 'number' ? dateStr : new Date(dateStr).getTime()
  const seconds = Math.floor((Date.now() - ts) / 1000)
  // if (seconds < 60) return rtf.format(0, 'minute')

  for (const { amount, unit } of TIME_DIVISIONS) {
    if (seconds >= amount) {
      return rtf.format(-Math.floor(seconds / amount), unit)
    }
  }
  return rtf.format(0, 'minute')
}

/** Extract domain from a URL (e.g., "https://www.example.com/path" → "example.com") */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return ''
  }
}
