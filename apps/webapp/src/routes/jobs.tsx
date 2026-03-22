import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/jobs')({
    component: JobsPage,
})

function JobsPage() {
    return (
        <div className="py-2">
            <div
                className="text-center py-12"
                style={{ color: 'var(--meta-color)' }}
            >
                <p className="text-sm mb-4">
                    Web3 jobs for the DUKI ecosystem coming soon.
                </p>
                <p className="text-xs" style={{ color: 'var(--duki-500)' }}>
                    Companies building with universal kindness principles can post openings here.
                </p>
            </div>
        </div>
    )
}
