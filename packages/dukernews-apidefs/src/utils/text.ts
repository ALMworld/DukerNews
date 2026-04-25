
/**
 * Sanitize a word token for dictionary lookup and storage.
 * 
 * Logic:
 * 1. Trim non-alphanumeric characters (punctuation, symbols) from START and END.
 * 2. Preserve internal punctuation (e.g. "don't", "hello-world").
 * 3. Convert to lowercase.
 * 
 * Handles Unicode characters (CJK, etc.) via \p{L} and \p{N}.
 */
export function sanitizeWord(text: string): string {
    if (!text) return '';
    return text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase();
}
