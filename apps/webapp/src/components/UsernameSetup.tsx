/**
 * UsernameSetup — banner shown when a new user needs to set their username.
 * Triggered by ?agreement=1 on the user profile page.
 */
import { useState } from 'react'
import { mintUser } from '../server/users'
import { HeartHandshake } from 'lucide-react'

interface UsernameSetupProps {
    address: string
    onSaved: (username: string) => void
}

export default function UsernameSetup({ address, onSaved }: UsernameSetupProps) {
    const [editUsername, setEditUsername] = useState('')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState('')

    const handleSave = async () => {
        const name = editUsername.trim()
        if (!name || name.length < 2) return
        if (name.toLowerCase() === address.toLowerCase()) {
            setError('Username cannot be your wallet address')
            return
        }
        setError('')
        setSaving(true)
        try {
            await mintUser({
                data: { address, username: name },
            })
            setSaved(true)
            onSaved(name)
        } catch (e: any) {
            setError(e?.message || 'Failed to save')
        } finally {
            setSaving(false)
        }
    }

    if (saved) {
        return (
            <div className="px-4 py-3 rounded-lg"
                style={{
                    background: 'color-mix(in srgb, var(--accent) 10%, var(--card))',
                    border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
                    ✅ Username saved! You can now post and comment.
                </p>
            </div>
        )
    }

    return (
        <div className="px-4 py-3 rounded-lg"
            style={{
                background: 'color-mix(in srgb, var(--accent) 10%, var(--card))',
                border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
            }}>
            <h3 className="text-sm font-bold mb-1 flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
                <HeartHandshake size={16} /> Welcome! Set your username
            </h3>
            <p className="text-xs mb-3" style={{ color: 'var(--foreground)', opacity: 0.8 }}>
                Choose a unique username to start posting and commenting. This cannot be your wallet address.
            </p>
            <div className="flex gap-2 items-center flex-wrap">
                <input
                    type="text"
                    value={editUsername}
                    onChange={e => { setEditUsername(e.target.value); setError('') }}
                    placeholder="Pick a username..."
                    className="px-2 py-1 text-sm rounded"
                    style={{
                        background: 'var(--input)',
                        color: 'var(--foreground)',
                        border: `1px solid ${error ? 'var(--accent)' : 'var(--border)'}`,
                        outline: 'none',
                        width: '200px',
                        maxWidth: '50vw',
                        fontSize: '10pt',
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSave() } }}
                    autoFocus
                />
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !editUsername.trim() || editUsername.trim().length < 2}
                    className="px-3 py-1 text-xs font-semibold rounded transition-all disabled:opacity-40"
                    style={{
                        background: 'var(--accent)',
                        color: '#fff',
                        border: 'none',
                        cursor: saving ? 'wait' : 'pointer',
                    }}
                >
                    {saving ? 'saving...' : 'Save'}
                </button>
            </div>
            {error && (
                <div className="text-xs mt-1" style={{ color: 'var(--accent)' }}>{error}</div>
            )}
        </div>
    )
}
