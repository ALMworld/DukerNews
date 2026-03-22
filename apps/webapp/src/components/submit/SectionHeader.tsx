/**
 * SectionHeader — Reusable separator header for form sections.
 *
 * Renders: [icon] LABEL ————————————
 * Uses --duki-400 accent color and --border for the line.
 */
import type { LucideIcon } from 'lucide-react'

interface SectionHeaderProps {
    icon: LucideIcon
    label: string
}

export function SectionHeader({ icon: Icon, label }: SectionHeaderProps) {
    return (
        <div className="flex items-center gap-2 pt-1">
            <Icon size={12} style={{ color: 'var(--duki-400)' }} />
            <span
                className="text-[10px] font-medium tracking-wide whitespace-nowrap"
                style={{ color: 'var(--duki-400)' }}
            >
                {label}
            </span>
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        </div>
    )
}
