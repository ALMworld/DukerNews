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
        dukiValues,
        productTags,
        productType,
        daoUrl,
        daoContractAddress,
    } = data

    const DukiIcon = DUKI_ICONS[dukiType] ?? null
    const formattedValues = dukiValues
        .map(bp => (bp / 100).toFixed(bp % 100 === 0 ? 0 : 1) + '%')
        .join(' · ')
    const link = daoUrl || daoContractAddress || null
    const tags = productTags.slice(0, MAX_DISPLAY_TAGS)
    const TypeIcon = PRODUCT_ICONS[productType] ?? null
    const typeLabel = PRODUCT_LABELS[productType] ?? ''

    return (
        <>
            {/* Duki donation values */}
            {DukiIcon && formattedValues && (
                <>
                    {link ? (
                        <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="meta-link no-underline inline-flex items-center gap-0.5"
                            style={{ color: 'inherit', transform: 'translateY(1px)' }}
                            title={`${dukiType === DukiType.REVENUE_SHARE ? 'Revenue' : 'Profit'}: ${formattedValues}`}
                        >
                            <DukiIcon size={META_ICON_SIZE} />{formattedValues}
                        </a>
                    ) : (
                        <span
                            className="meta-link inline-flex items-center gap-0.5"
                            style={{ color: 'inherit', transform: 'translateY(1px)' }}
                            title={`${dukiType === DukiType.REVENUE_SHARE ? 'Revenue' : 'Profit'}: ${formattedValues}`}
                        >
                            <DukiIcon size={META_ICON_SIZE} />{formattedValues}
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
