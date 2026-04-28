import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MARKET_PAGE_SIZE } from './constants'

interface PaginationControlsProps {
    page: number
    totalPages: number
    totalItems: number
    onPageChange: (page: number) => void
    compact?: boolean
}

export function PaginationControls({
    page,
    totalPages,
    totalItems,
    onPageChange,
    compact = false,
}: PaginationControlsProps) {
    if (totalItems <= MARKET_PAGE_SIZE) return null

    const start = (page - 1) * MARKET_PAGE_SIZE + 1
    const end = Math.min(page * MARKET_PAGE_SIZE, totalItems)

    // Generate page numbers with ellipsis
    const pages = buildPageNumbers(page, totalPages)

    return (
        <nav
            className={`flex items-center text-xs ${compact ? 'mt-4 justify-center gap-1' : 'mt-6 justify-between'}`}
            aria-label="Agent pages"
        >
            {!compact && (
                <span className="text-muted-foreground tabular-nums">
                    Showing <span className="font-semibold text-foreground">{start} - {end}</span> of{' '}
                    <span className="font-semibold text-foreground">{totalItems.toLocaleString()}</span>
                </span>
            )}

            <div className="flex items-center gap-1">
                <button
                    type="button"
                    onClick={() => onPageChange(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-transparent text-foreground cursor-pointer transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-40"
                    aria-label="Previous page"
                >
                    <ChevronLeft size={14} />
                </button>

                {pages.map((p, i) =>
                    p === '...' ? (
                        <span key={`ellipsis-${i}`} className="flex h-8 w-8 items-center justify-center text-muted-foreground">…</span>
                    ) : (
                        <button
                            key={p}
                            type="button"
                            onClick={() => onPageChange(p as number)}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold tabular-nums cursor-pointer transition-colors ${p === page
                                    ? 'bg-primary text-primary-foreground border border-primary'
                                    : 'border border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
                                }`}
                        >
                            {p}
                        </button>
                    )
                )}

                <button
                    type="button"
                    onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-transparent text-foreground cursor-pointer transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-40"
                    aria-label="Next page"
                >
                    <ChevronRight size={14} />
                </button>
            </div>
        </nav>
    )
}

function buildPageNumbers(current: number, total: number): Array<number | '...'> {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

    const pages: Array<number | '...'> = []
    pages.push(1)

    if (current > 3) pages.push('...')

    const start = Math.max(2, current - 1)
    const end = Math.min(total - 1, current + 1)
    for (let i = start; i <= end; i++) pages.push(i)

    if (current < total - 2) pages.push('...')

    pages.push(total)
    return pages
}
