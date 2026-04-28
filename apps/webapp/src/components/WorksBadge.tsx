/**
 * WorksBadge — Display component for Works post metadata.
 *
 * Uses proto-generated types directly (no toJson conversion).
 * Renders inline: duki icon + values · product-type icon + tags
 *
 * Icons match the Submit form (Lucide).
 */

import { Link } from '@tanstack/react-router'
import {
    DukiType,
    type WorksPostData,
    type PbPostData,
} from '@repo/dukernews-apidefs'
import {
    MAX_DISPLAY_TAGS,
    META_ICON_SIZE,
    DUKI_ICONS,
    PRODUCT_ICONS,
    PRODUCT_LABELS,
} from '../lib/constants'

// ─── Component ───────────────────────────────────────────

interface WorksBadgeProps {
    data: WorksPostData
}

export function WorksBadge({ data }: WorksBadgeProps) {
    const {
        dukiType,
        approxBps,
        productTags,
        productType,
        pledgeUrl,
        chainContracts,
    } = data

    const DukiIcon = DUKI_ICONS[dukiType] ?? null
    const formattedApprox = approxBps
        ? (approxBps / 100).toFixed(approxBps % 100 === 0 ? 0 : 1) + '%'
        : ''
    // Prefer the off-chain pledge URL; otherwise link to the first deployed
    // contract entry. Both are agent-inherited.
    const link = pledgeUrl || chainContracts[0]?.contractAddr || null
    const tags = productTags.slice(0, MAX_DISPLAY_TAGS)
    const TypeIcon = PRODUCT_ICONS[productType] ?? null
    const typeLabel = PRODUCT_LABELS[productType] ?? ''

    return (
        <>
            {/* Duki donation values */}
            {DukiIcon && formattedApprox && (
                <>
                    {link ? (
                        <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="meta-link no-underline inline-flex items-center gap-0.5"
                            style={{ color: 'inherit', transform: 'translateY(1px)' }}
                            title={`${dukiType === DukiType.REVENUE_SHARE ? 'Revenue' : 'Profit'}: ${formattedApprox}`}
                        >
                            <DukiIcon size={META_ICON_SIZE} />{formattedApprox}
                        </a>
                    ) : (
                        <span
                            className="meta-link inline-flex items-center gap-0.5"
                            style={{ color: 'inherit', transform: 'translateY(1px)' }}
                            title={`${dukiType === DukiType.REVENUE_SHARE ? 'Revenue' : 'Profit'}: ${formattedApprox}`}
                        >
                            <DukiIcon size={META_ICON_SIZE} />{formattedApprox}
                        </span>
                    )}
                </>
            )}

            {/* Product tags with type icon */}
            {tags.length > 0 && (
                <span className="inline-flex items-center gap-0.5">
                    {TypeIcon && <span title={typeLabel} className="inline-flex items-center" style={{ transform: 'translateY(1px)' }}><TypeIcon size={META_ICON_SIZE} /></span>}
                    {tags.map((tag, i) => (
                        <span key={tag} className="inline-flex items-center gap-0.5">
                            <Link
                                to="/show"
                                search={{ tag } as any}
                                className="meta-link no-underline"
                                style={{ color: 'inherit' }}
                            >
                                {tag}
                            </Link>
                            {i < tags.length - 1 && <span>·</span>}
                        </span>
                    ))}
                </span>
            )}
        </>
    )
}

// Re-export PbPostData for typed usage in PostItem
export type { PbPostData, WorksPostData }
