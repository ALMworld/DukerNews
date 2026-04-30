/**
 * WorksBadge — Display component for Works post metadata.
 *
 * Uses proto-generated types directly (no toJson conversion).
 * Renders inline: duki icon + values · product-type icon + keyword
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
        keyword,
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

            {/* Keyword with product type icon */}
            {keyword && (
                <span className="inline-flex items-center gap-0.5">
                    {TypeIcon && <span title={typeLabel} className="inline-flex items-center" style={{ transform: 'translateY(1px)' }}><TypeIcon size={META_ICON_SIZE} /></span>}
                    <Link
                        to="/show"
                        search={{ tag: keyword } as any}
                        className="meta-link no-underline"
                        style={{ color: 'inherit' }}
                    >
                        {keyword}
                    </Link>
                </span>
            )}
        </>
    )
}

// Re-export PbPostData for typed usage in PostItem
export type { PbPostData, WorksPostData }
