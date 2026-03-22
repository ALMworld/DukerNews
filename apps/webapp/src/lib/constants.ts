import {
    TrendingUp,
    PieChart,
    AppWindow,
    Package,
    FileDigit,
    HandCoins,
    MessageSquareDashed,
    UserStar,
} from 'lucide-react'
import { DukiType, ProductType, PostKind } from '@repo/apidefs'

/** Max tags displayed per post item */
export const MAX_DISPLAY_TAGS = 3

/** Icon size used in meta rows / badges */
export const META_ICON_SIZE = 10

// ─── Shared icon / label maps ────────────────────────────

export const DUKI_ICONS: Partial<Record<DukiType, typeof TrendingUp>> = {
    [DukiType.REVENUE]: TrendingUp,
    [DukiType.PROFIT]: PieChart,
}

export const PRODUCT_ICONS: Partial<Record<ProductType, typeof AppWindow>> = {
    [ProductType.DIGITAL]: FileDigit,
    [ProductType.PHYSICAL]: Package,
    [ProductType.SERVICE]: UserStar,
}

export const PRODUCT_LABELS: Partial<Record<ProductType, string>> = {
    [ProductType.DIGITAL]: 'Digital Product',
    [ProductType.PHYSICAL]: 'Physical Product',
    [ProductType.SERVICE]: 'Service Product',
}

export const KIND_ICONS: Partial<Record<PostKind, typeof HandCoins>> = {
    [PostKind.WORKS]: HandCoins,
    [PostKind.VOICE]: MessageSquareDashed,
}

export const KIND_LABELS: Partial<Record<PostKind, string>> = {
    [PostKind.WORKS]: 'Works',
    [PostKind.VOICE]: 'Message',
}
