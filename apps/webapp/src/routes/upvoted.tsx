import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/upvoted')({
    validateSearch: (search: Record<string, unknown>) => ({
        id: (search.id as string) || '',
        comments: (search.comments as string) || '',
    }),
    component: UpvotedPage,
})

function UpvotedPage() {
    const { id, comments: showComments } = Route.useSearch()
    const label = showComments === 't' ? 'upvoted comments' : 'upvoted submissions'

    if (!id) return <div className="px-3 py-4 text-sm" style={{ color: 'var(--meta-color)' }}>No user specified.</div>

    return (
        <div className="px-3 py-4">
            <h3 className="text-sm mb-3" style={{ color: 'var(--meta-color)' }}>
                <Link to="/user" search={{ id }} className="hover:underline" style={{ color: 'var(--duki-300)' }}>{id}</Link>'s {label}
            </h3>
            <div className="text-sm" style={{ color: 'var(--meta-color)' }}>
                No {label} yet.
            </div>
        </div>
    )
}
