import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getPosts } from '../server/posts'
import { timeAgo } from '../lib/utils'
import { useLocale } from '../lib/locale-context'
import type { PbPost } from '@repo/dukernews-apidefs'

export const Route = createFileRoute('/submitted')({
    validateSearch: (search: Record<string, unknown>) => ({
        id: (search.id as string) || '',
    }),
    component: SubmittedPage,
})

function SubmittedPage() {
    const { id } = Route.useSearch()
    const { locale: userLocale } = useLocale()
    const [posts, setPosts] = useState<PbPost[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!id) { setLoading(false); return }
        getPosts({ data: { address: id } }).then(({ posts: all }) => {
            setPosts(all)
            setLoading(false)
        })
    }, [id])

    if (!id) return <div className="px-3 py-4 text-sm" style={{ color: 'var(--meta-color)' }}>No user specified.</div>

    return (
        <div className="px-3 py-4">
            <h3 className="text-sm mb-3" style={{ color: 'var(--meta-color)' }}>
                <Link to="/user" search={{ id }} className="hover:underline" style={{ color: 'var(--duki-300)' }}>{id}</Link>'s submissions
            </h3>
            {loading ? (
                <div className="text-sm" style={{ color: 'var(--meta-color)' }}>Loading...</div>
            ) : posts.length === 0 ? (
                <div className="text-sm" style={{ color: 'var(--meta-color)' }}>No submissions.</div>
            ) : (
                <div className="space-y-2">
                    {posts.map((post) => (
                        <div key={post.id} className="text-sm">
                            <Link
                                to="/post/$id"
                                params={{ id: String(post.id) }}
                                className="no-underline hover:underline"
                                style={{ color: 'var(--foreground)' }}
                            >
                                {post.title}
                            </Link>
                            <span className="ml-2" style={{ color: 'var(--meta-color)', fontSize: '9pt' }}>
                                ({post.domain}) · {post.points} points · {timeAgo(post.createdAt, userLocale)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
