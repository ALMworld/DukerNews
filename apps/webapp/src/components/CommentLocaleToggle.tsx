import { LOCALE_LABELS, type SupportedLocale } from '../lib/locale-context'

interface CommentLocaleToggleProps {
    /** The two locale options to show */
    options: [SupportedLocale, SupportedLocale]
    /** Currently selected locale */
    value: SupportedLocale
    /** Callback when locale changes */
    onChange: (locale: SupportedLocale) => void
}

/**
 * A compact binary locale toggle for comment/reply input boxes.
 * Only shown when the post/comment locale differs from the user's locale.
 * Renders as two small pill-style buttons at the bottom-left of the textarea.
 */
export default function CommentLocaleToggle({
    options,
    value,
    onChange,
}: CommentLocaleToggleProps) {
    return (
        <div className="flex items-center gap-1">
            {options.map((opt) => {
                const isActive = opt === value
                return (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => onChange(opt)}
                        className="text-xs px-2 py-0.5 rounded-full transition-all"
                        style={{
                            background: isActive ? 'var(--duki-600)' : 'transparent',
                            color: isActive ? 'var(--duki-100)' : 'var(--meta-color)',
                            border: isActive
                                ? '1px solid var(--duki-500)'
                                : '1px solid var(--border)',
                            cursor: 'pointer',
                            fontWeight: isActive ? 600 : 400,
                            fontSize: '11px',
                            lineHeight: '16px',
                        }}
                    >
                        {LOCALE_LABELS[opt]}
                    </button>
                )
            })}
        </div>
    )
}

/**
 * Determine the default comment locale and the two options.
 *
 * Rules:
 * - If userLocale === contentLocale → returns null (no toggle needed)
 * - If showing translated view → default to userLocale, options = [userLocale, contentLocale]
 * - If showing original → default to contentLocale, options = [contentLocale, userLocale]
 */
export function getCommentLocaleConfig(
    userLocale: SupportedLocale,
    contentLocale: string,
    isViewingTranslated: boolean,
): { defaultLocale: SupportedLocale; options: [SupportedLocale, SupportedLocale] } | null {
    if (userLocale === contentLocale) return null

    const cl = contentLocale as SupportedLocale
    if (isViewingTranslated) {
        return { defaultLocale: userLocale, options: [userLocale, cl] }
    }
    return { defaultLocale: cl, options: [cl, userLocale] }
}
