/**
 * PostMeta — the meta row shown below a post title.
 *
 *   [KindIcon] N points  by <username>  ago  [WorksBadge]  N comments  [Translate All]
 *
 * Props:
 *   titleRow - detail-page layout: comments as plain text, "Translate All" button shown.
 */
import { Link } from '@tanstack/react-router'
import type { PbPost, PbPostData } from '@repo/dukernews-apidefs'
import { WorksBadge } from './WorksBadge'
import { timeAgo } from '../lib/utils'
import { useLocale } from '../lib/locale-context'
import { KIND_ICONS, KIND_LABELS, META_ICON_SIZE } from '../lib/constants'

interface PostMetaProps {
    post: PbPost
    points: number
    /** When true — detail-page layout */
    titleRow?: boolean
    // ── TranslateAll (detail-page only) ──────────────
    translateAllActive?: boolean
    onTranslateAll?: () => void
}

export function PostMeta({
    post,
    points,
    titleRow = false,
    translateAllActive,
    onTranslateAll,
}: PostMetaProps) {
    const { locale: userLocale } = useLocale()
    const ago = timeAgo(post.createdAt, userLocale)

    const postData = (post as any).postData as PbPostData | undefined
    const worksData = postData?.payload?.case === 'works' ? postData.payload.value : null

    const KindIcon = KIND_ICONS[post.kind]

    const Sep = () => <span style={{ opacity: 0.35, margin: '0 2px' }}>|</span>

    return (
        <div
            className={`flex items-center flex-wrap leading-tight ${titleRow ? 'mt-1 gap-2' : 'mt-0.5 gap-1.5'}`}
            style={{ color: 'var(--meta-color)', fontSize: '8pt' }}
        >
            <span>{points} points</span>

            <Sep />

            {/* Kind icon + author — one semantic unit */}
            <span className="inline-flex items-center gap-0.5">
                {KindIcon && (
                    <span
                        className="inline-flex items-center"
                        style={{ color: 'inherit', transform: 'translateY(1px)' }}
                        title={KIND_LABELS[post.kind]}
                    >
                        <KindIcon size={META_ICON_SIZE} />
                    </span>
                )}
                <span>by <Link
                    to="/user"
                    search={{ id: post.username }}
                    className="meta-link no-underline"
                    style={{ color: 'inherit' }}
                >{post.username}</Link></span>
            </span>

            <Sep />

            <span>{ago}</span>

            {/* Works badge */}
            {worksData && <><Sep /><WorksBadge data={worksData} /></>}

            <Sep />



            <Link
                to="/post/$id"
                params={{ id: String(post.id) }}
                hash={titleRow ? "comments" : undefined}
                className="no-underline"
                style={{ color: 'inherit' }}
            >
                {post.commentCount} comments
            </Link>

            {/* InteractionBar moved to post detail page — rendered after body text */}

            {/* Translate All — detail-page only, locale-aware */}
            {titleRow && onTranslateAll && post.locale && post.locale !== userLocale && (
                <><Sep /><button
                    onClick={onTranslateAll}
                    className="comment-nav-link"
                    style={{
                        color: translateAllActive ? 'var(--duki-400)' : 'var(--meta-color)',
                    }}
                    title={translateAllActive ? 'Show original comments' : 'Auto-translate all comments'}
                >
                    {translateAllActive ? 'Original' : 'Translate All'}
                </button></>
            )}
        </div>
    )
}
