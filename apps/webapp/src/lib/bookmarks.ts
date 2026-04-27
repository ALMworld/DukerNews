/**
 * bookmarks.ts — Per-browser bookmark store for DUKIGEN agents.
 *
 * Storage: a single JSON-encoded string[] of agentIds in localStorage under
 * BOOKMARKS_KEY. Per-browser, not per-wallet — the user explicitly asked to
 * keep this entirely client-side. If you ever want per-wallet, key by `me.ego`.
 *
 * Reactivity: useBookmarks() subscribes to a tiny in-memory event bus so that
 * components in different parts of the tree re-render when bookmarks change,
 * without requiring storage events (which don't fire in the same tab).
 */
import { useEffect, useState } from 'react'

const BOOKMARKS_KEY = 'dukigen.bookmarks.v1'

// In-memory subscribers — Set so unsubscribe is O(1) and we never double-fire.
const listeners = new Set<() => void>()

function readRaw(): string[] {
    if (typeof window === 'undefined') return []
    try {
        const raw = window.localStorage.getItem(BOOKMARKS_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
    } catch {
        return []
    }
}

function writeRaw(ids: string[]): void {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(ids))
    } catch {
        // Quota exceeded / privacy mode — silently fall back to in-memory only.
    }
    listeners.forEach((fn) => fn())
}

export function getBookmarks(): string[] {
    return readRaw()
}

export function isBookmarked(agentId: string | bigint): boolean {
    return readRaw().includes(String(agentId))
}

/** Toggle and return the new state. */
export function toggleBookmark(agentId: string | bigint): boolean {
    const id = String(agentId)
    const current = readRaw()
    const idx = current.indexOf(id)
    if (idx >= 0) {
        const next = current.slice(0, idx).concat(current.slice(idx + 1))
        writeRaw(next)
        return false
    } else {
        writeRaw([id, ...current])
        return true
    }
}

/**
 * React hook — returns the live bookmarks list and helpers. Components using
 * this re-render whenever any bookmark anywhere changes.
 */
export function useBookmarks() {
    const [bookmarks, setBookmarks] = useState<string[]>(() => readRaw())

    useEffect(() => {
        const onChange = () => setBookmarks(readRaw())
        listeners.add(onChange)
        // Also listen to cross-tab changes from the storage event.
        const onStorage = (e: StorageEvent) => {
            if (e.key === BOOKMARKS_KEY) setBookmarks(readRaw())
        }
        window.addEventListener('storage', onStorage)
        return () => {
            listeners.delete(onChange)
            window.removeEventListener('storage', onStorage)
        }
    }, [])

    return {
        bookmarks,
        isBookmarked: (agentId: string | bigint) => bookmarks.includes(String(agentId)),
        toggle: toggleBookmark,
        count: bookmarks.length,
    }
}
