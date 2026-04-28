import type { ReactNode } from 'react'

interface EmptyStateProps {
    children: ReactNode
    tone?: 'neutral' | 'error'
}

export function EmptyState({ children, tone = 'neutral' }: EmptyStateProps) {
    return (
        <div className={`flex items-center justify-center gap-2 min-h-[160px] px-4 py-8 border border-dashed rounded-lg text-sm flex-wrap ${tone === 'error' ? 'text-red-500' : 'text-muted-foreground'}`}>
            {children}
        </div>
    )
}
