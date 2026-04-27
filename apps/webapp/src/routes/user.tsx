import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import { getUser as fetchUser, updateUser } from '../server/users'
import { useTheme, type Theme } from '../lib/theme-context'
import type { UserProfile } from '../services/user-service'
import UsernameSetup from '../components/UsernameSetup'
import { useAuthStore } from '../lib/authStore'

export const Route = createFileRoute('/user')({
    validateSearch: (search: Record<string, unknown>) => ({
        id: (search.id as string) || '',
    }),
    component: UserProfilePage,
})

function formatDate(dateStr: string | number | bigint): string {
    return new Date(Number(dateStr)).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    })
}

function UserProfilePage() {
    const { id: username } = Route.useSearch()
    // Read agreement from URL directly (not in validateSearch to keep Links clean)
    const agreement = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('agreement') === '1'
    const [user, setUser] = useState<UserProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Editable fields (only used for own profile)
    const [about, setAbout] = useState('')
    const [email, setEmail] = useState('')

    // Detect own profile — check both wagmi wallet and auth store (for debug login)
    const { address: walletAddress } = useAccount()
    const { disconnect } = useDisconnect()
    const { theme, setTheme } = useTheme()
    const { me, setMe } = useAuthStore()
    const effectiveAddress = walletAddress || me?.ego || ''
    const isOwnProfile = !!effectiveAddress && !!username && (
        username.toLowerCase() === effectiveAddress.toLowerCase()
        || (me?.username?.toLowerCase() === user?.username?.toLowerCase() && !!me?.username)
    )

    useEffect(() => {
        if (!username) {
            setLoading(false)
            return
        }
        setLoading(true)
        fetchUser({ data: { identifier: username } }).then((data) => {
            setUser(data)
            if (data) {
                setAbout(data.about)
                setEmail(data.email)
            }
            setLoading(false)
        })
    }, [username])

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        const updated = await updateUser({
            data: { address: user?.address ?? username, about, email },
        })
        setUser(updated)
        setSaving(false)
    }

    if (loading) {
        return <div className="px-3 py-4" style={{ minHeight: '50vh' }} />
    }

    if (!user || !username) {
        // New user: own address but no DB record yet → show mint UI
        const isOwnAddress = !!effectiveAddress && !!username &&
            username.toLowerCase() === effectiveAddress.toLowerCase()

        if (isOwnAddress) {
            return (
                <div className="px-3 py-4" style={{ maxWidth: '560px' }}>
                    <UsernameSetup
                        address={username}
                        onSaved={() => {
                            // Reload so the full profile renders with the new username
                            window.location.reload()
                        }}
                    />
                </div>
            )
        }

        return (
            <div className="px-3 py-4">
                <p className="text-sm" style={{ color: 'var(--meta-color)' }}>
                    No such user.
                </p>
                <Link
                    to="/"
                    className="text-sm no-underline hover:underline mt-2 inline-block"
                    style={{ color: 'var(--link-color)' }}
                >
                    ← Back
                </Link>
            </div>
        )
    }


    const labelStyle = {
        color: 'var(--meta-color)',
        verticalAlign: 'top' as const,
        paddingRight: '8px',
        paddingTop: '2px',
        paddingBottom: '4px',
        whiteSpace: 'nowrap' as const,
        textAlign: 'right' as const,
        fontSize: '10pt',
    }

    const valueStyle = {
        color: 'var(--foreground)',
        paddingBottom: '4px',
        fontSize: '10pt',
    }


    return (
        <div className="px-3 py-4" style={{ maxWidth: '100%', overflow: 'hidden' }}>
            <form onSubmit={handleUpdate}>
                <table style={{ borderSpacing: '0', tableLayout: 'fixed', width: '100%', maxWidth: '600px' }}>
                    <colgroup>
                        <col style={{ width: '70px' }} />
                        <col />
                    </colgroup>
                    <tbody>
                        {/* Username setup banner — shown for first-time users */}
                        {agreement && isOwnProfile && (
                            <tr>
                                <td colSpan={2} style={{ paddingBottom: '12px' }}>
                                    <UsernameSetup
                                        address={user.address}
                                        onSaved={(name) => {
                                            setUser(prev => prev ? { ...prev, username: name } : prev)
                                            // Sync new username into authStore so useRequireAuth
                                            // stops treating this user as setup-incomplete
                                            if (me) setMe({ ...me, username: name })
                                        }}
                                    />
                                </td>
                            </tr>
                        )}

                        {/* Username */}
                        <tr>
                            <td style={labelStyle}>user:</td>
                            <td style={valueStyle}>
                                <span className="font-semibold" style={{
                                    color: 'var(--duki-300)',
                                    wordBreak: 'break-all',
                                    display: 'block',
                                    maxWidth: '100%',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}>
                                    {user.username}
                                </span>
                            </td>
                        </tr>

                        {/* Action buttons — own profile only */}
                        {isOwnProfile && (
                            <tr>
                                <td style={labelStyle}></td>
                                <td style={{ ...valueStyle, paddingTop: '4px', paddingBottom: '8px' }}>
                                    <span className="flex items-center gap-2 flex-wrap">
                                        {/* Copy address */}
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(effectiveAddress || '')
                                                const btn = document.getElementById('copy-addr-btn')
                                                if (btn) { btn.textContent = 'copied!'; setTimeout(() => { btn.textContent = 'copy address' }, 1500) }
                                            }}
                                            id="copy-addr-btn"
                                            type="button"
                                            className="px-2 py-0.5 text-xs rounded"
                                            style={{
                                                background: 'var(--duki-700)',
                                                color: 'var(--duki-300)',
                                                border: '1px solid var(--border)',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            copy address
                                        </button>
                                        {/* DAO */}
                                        <Link
                                            to="/dao"
                                            className="px-2 py-0.5 text-xs rounded no-underline"
                                            style={{
                                                background: 'var(--duki-700)',
                                                color: 'var(--duki-300)',
                                                border: '1px solid var(--border)',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            DAO
                                        </Link>
                                        {/* Logout */}
                                        <button
                                            onClick={() => disconnect()}
                                            type="button"
                                            className="px-2 py-0.5 text-xs rounded"
                                            style={{
                                                background: 'var(--duki-700)',
                                                color: 'var(--duki-300)',
                                                border: '1px solid var(--border)',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            logout
                                        </button>
                                    </span>
                                </td>
                            </tr>
                        )}

                        {/* Created */}
                        <tr>
                            <td style={labelStyle}>created:</td>
                            <td style={valueStyle}>{formatDate(user.createdAt)}</td>
                        </tr>

                        {/* Karma */}
                        <tr>
                            <td style={labelStyle}>karma:</td>
                            <td style={valueStyle}>{user.karma}</td>
                        </tr>

                        {/* About */}
                        <tr>
                            <td style={labelStyle}>about:</td>
                            <td style={valueStyle}>
                                {isOwnProfile ? (
                                    <textarea
                                        value={about}
                                        onChange={(e) => setAbout(e.target.value)}
                                        rows={4}
                                        cols={60}
                                        className="text-sm resize-y"
                                        style={{
                                            background: 'var(--input)',
                                            color: 'var(--foreground)',
                                            border: '1px solid var(--border)',
                                            outline: 'none',
                                            padding: '4px',
                                            width: '100%',
                                            maxWidth: '400px',
                                            fontFamily: 'inherit',
                                        }}
                                    />
                                ) : (
                                    <span>{user.about || '—'}</span>
                                )}
                            </td>
                        </tr>

                        {/* Email — only shown on own profile */}
                        {isOwnProfile && (
                            <tr>
                                <td style={labelStyle}>email:</td>
                                <td style={valueStyle}>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="text-sm"
                                        style={{
                                            background: 'var(--input)',
                                            color: 'var(--foreground)',
                                            border: '1px solid var(--border)',
                                            outline: 'none',
                                            padding: '2px 4px',
                                            width: '100%',
                                            maxWidth: '400px',
                                            fontFamily: 'inherit',
                                        }}
                                    />
                                </td>
                            </tr>
                        )}

                        {/* Theme — own profile only */}
                        {isOwnProfile && (
                            <tr>
                                <td style={labelStyle}>theme:</td>
                                <td style={valueStyle}>
                                    <span className="flex items-center gap-1.5">
                                        {(['dark', 'light', 'system'] as Theme[]).map((t) => (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => setTheme(t)}
                                                className="px-2 py-0.5 text-xs rounded"
                                                style={{
                                                    background: theme === t ? 'var(--duki-600)' : 'var(--duki-700)',
                                                    color: theme === t ? 'var(--duki-100)' : 'var(--duki-300)',
                                                    border: `1px solid ${theme === t ? 'var(--duki-500)' : 'var(--border)'}`,
                                                    cursor: 'pointer',
                                                    fontWeight: theme === t ? 600 : 400,
                                                }}
                                            >
                                                {t}
                                            </button>
                                        ))}
                                    </span>
                                </td>
                            </tr>
                        )}

                        {/* submissions */}
                        <tr>
                            <td style={labelStyle}></td>
                            <td style={valueStyle}>
                                <Link
                                    to="/submitted"
                                    search={{ id: username }}
                                    className="underline hover:opacity-80"
                                    style={{ color: 'var(--link-color)' }}
                                >
                                    submissions
                                </Link>
                            </td>
                        </tr>

                        {/* comments */}
                        <tr>
                            <td style={labelStyle}></td>
                            <td style={valueStyle}>
                                <Link
                                    to="/threads"
                                    search={{ id: username, next: undefined }}
                                    className="underline hover:opacity-80"
                                    style={{ color: 'var(--link-color)' }}
                                >
                                    comments
                                </Link>
                            </td>
                        </tr>

                        {/* upvoted — own profile only */}
                        {isOwnProfile && (
                            <>
                                <tr>
                                    <td style={labelStyle}></td>
                                    <td style={valueStyle}>
                                        <Link
                                            to="/upvoted"
                                            search={{ id: username, comments: '' }}
                                            className="underline hover:opacity-80"
                                            style={{ color: 'var(--link-color)' }}
                                        >
                                            upvoted submissions
                                        </Link>
                                        {' / '}
                                        <Link
                                            to="/upvoted"
                                            search={{ id: username, comments: 't' }}
                                            className="underline hover:opacity-80"
                                            style={{ color: 'var(--link-color)' }}
                                        >
                                            comments
                                        </Link>
                                    </td>
                                </tr>
                                <tr>
                                    <td style={labelStyle}></td>
                                    <td style={valueStyle}>
                                        <Link
                                            to="/favorites"
                                            search={{ id: username }}
                                            className="underline hover:opacity-80"
                                            style={{ color: 'var(--link-color)' }}
                                        >
                                            favorite submissions
                                        </Link>
                                        {' / '}
                                        <Link
                                            to="/favorites"
                                            search={{ id: username, comments: 't' }}
                                            className="underline hover:opacity-80"
                                            style={{ color: 'var(--link-color)' }}
                                        >
                                            comments
                                        </Link>
                                        {'  '}
                                        <span
                                            className="italic"
                                            style={{ color: 'var(--meta-color)', fontSize: '9pt' }}
                                        >
                                            (publicly visible)
                                        </span>
                                    </td>
                                </tr>
                                {isOwnProfile && (
                                    <tr>
                                        <td style={labelStyle}></td>
                                        <td style={valueStyle}>
                                            <Link
                                                to="/favorites"
                                                search={{ id: username, agents: 't' }}
                                                className="underline hover:opacity-80"
                                                style={{ color: 'var(--link-color)' }}
                                            >
                                                favorite agents
                                            </Link>
                                            {'  '}
                                            <span
                                                className="italic"
                                                style={{ color: 'var(--meta-color)', fontSize: '9pt' }}
                                            >
                                                (this browser only)
                                            </span>
                                        </td>
                                    </tr>
                                )}
                            </>
                        )}

                        {/* Update button — only for own profile */}
                        {isOwnProfile && (
                            <tr>
                                <td style={labelStyle}></td>
                                <td style={{ ...valueStyle, paddingTop: '8px' }}>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="px-3 py-1 text-xs font-medium"
                                        style={{
                                            background: 'var(--duki-700)',
                                            color: 'var(--duki-100)',
                                            border: '1px solid var(--border)',
                                            cursor: saving ? 'wait' : 'pointer',
                                        }}
                                    >
                                        {saving ? 'saving...' : 'update'}
                                    </button>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </form>
        </div>
    )
}
