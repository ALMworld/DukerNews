/**
 * JS port of DukerNews._isValidName — mirrors Solidity validation exactly.
 * Returns empty string if valid, or a locale-aware error message.
 */
import * as m from '../paraglide/messages.js'

const MAX_NAME_BYTES = 192

export function validateName(name: string): string {
    const b = new TextEncoder().encode(name)
    const len = b.length
    if (len < 1 || len > MAX_NAME_BYTES) return m.mint_err_name_length()

    let hasLatin = false
    let hasCyrillic = false

    for (let i = 0; i < len; i++) {
        const c = b[i]

        // Rule 1: Control characters + space (0x00-0x20)
        if (c <= 0x20) return m.mint_err_invalid_name()

        // Rule 2: SVG/XML injection chars + @
        if (c === 0x22 || c === 0x26 || c === 0x27 ||
            c === 0x3C || c === 0x3E || c === 0x40) return m.mint_err_invalid_name()

        // Rule 3: DEL character
        if (c === 0x7F) return m.mint_err_invalid_name()

        // Track Latin letters
        if ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)) {
            hasLatin = true
        }

        // Multi-byte UTF-8 checks
        if (c >= 0x80 && i + 1 < len) {
            const c1 = b[i + 1]

            // Track Cyrillic (U+0400-U+04FF) → UTF-8: D0-D3
            if (c >= 0xD0 && c <= 0xD3) {
                hasCyrillic = true
            }

            // Rule 4: Combining diacritical marks (U+0300-U+036F)
            if (c === 0xCC) return m.mint_err_invalid_name()
            if (c === 0xCD && c1 <= 0xAF) return m.mint_err_invalid_name()

            // 3-byte sequences
            if (c >= 0xE0 && c <= 0xEF && i + 2 < len) {
                const c2 = b[i + 2]

                // Rule 5: Zero-width chars + direction overrides
                if (c === 0xE2 && (c1 === 0x80 || c1 === 0x81)) return m.mint_err_invalid_name()

                // Rule 6: Enclosed alphanumerics
                if (c === 0xE2 && c1 >= 0x91 && c1 <= 0x93) return m.mint_err_invalid_name()

                // Rule 7: Superscripts/subscripts
                if (c === 0xE2 && c1 === 0x82) return m.mint_err_invalid_name()

                // Rule 8: Ligatures
                if (c === 0xEF && c1 === 0xAC) return m.mint_err_invalid_name()

                // Rule 9: BOM
                if (c === 0xEF && c1 === 0xBB && c2 === 0xBF) return m.mint_err_invalid_name()

                // Rule 10: Variation selectors
                if (c === 0xEF && c1 === 0xB8 && c2 >= 0x80 && c2 <= 0x8F) return m.mint_err_invalid_name()

                // Rule 11: Non-characters
                if (c === 0xEF && c1 === 0xB7) return m.mint_err_invalid_name()

                // Rule 12: Specials block
                if (c === 0xEF && c1 === 0xBF && c2 >= 0xB0) return m.mint_err_invalid_name()

                // Rule 13: Fullwidth Latin
                if (c === 0xEF && (c1 === 0xBC || c1 === 0xBD)) return m.mint_err_invalid_name()
            }

            // Rule 14: Tag characters (4-byte)
            if (c === 0xF3 && c1 === 0xA0) return m.mint_err_invalid_name()
        }
    }

    // Rule 15: Reject Latin + Cyrillic mixing
    if (hasLatin && hasCyrillic) return m.mint_err_mixed_script()

    return ''
}
