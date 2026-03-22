/**
 * Centralised TanStack Query key factory.
 * Import these everywhere instead of using inline string arrays,
 * so cache invalidation stays consistent across components.
 */

export const queryKeys = {
    /** Auth session — cached after login, invalidated on logout. */
    authMe: () => ['auth-me'] as const,

    /**
     * Translation for a single comment.
     * Keyed by commentId + target locale so switching locale
     * fetches a fresh translation without evicting others.
     */
    commentTranslation: (commentId: number, toLocale: string) =>
        ['comment-translation', commentId, toLocale] as const,
} as const
