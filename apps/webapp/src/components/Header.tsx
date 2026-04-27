import { Link, useLocation, useRouteContext } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { useLocale, LOCALES } from '../lib/locale-context'
import * as m from '../paraglide/messages.js'
import { useAuthStore } from '../lib/authStore'

import WalletButton from '../lib/wallet'

const navLinks = [
  { to: '/newest', msg: () => m.nav_new(), auth: false },
  { to: '/threads', msg: () => (m as any).nav_threads ? (m as any).nav_threads() : 'threads', auth: true },
  { to: '/past', msg: () => m.nav_past(), auth: false },
  { to: '/comments', msg: () => m.nav_comments(), auth: false },
  // { to: '/voice', msg: () => m.nav_voice(), auth: false },
  // { to: '/jobs', msg: () => m.nav_jobs(), auth: false },
  { to: '/market', msg: () => m.nav_market(), auth: false },
  { to: '/submit', msg: () => m.nav_submit(), auth: false },
]

/* ── Logo — reuses /favicon.svg ── */
function DukerLogo({ size = 24 }: { size?: number }) {
  return (
    <img
      src="/favicon.svg"
      width={size}
      height={size}
      alt="Duker News logo"
      style={{
        // borderRadius: '50%',
        // border: '0.5px solid purple',
        // boxSizing: 'content-box',
      }}
    />
  )
}

/* ── Search Icon ── */
function SearchIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}



/* ── Search Modal ── */
function SearchModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
    }
  }, [isOpen])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
      return () => document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen, onClose])

  const handleSearch = () => {
    if (!query.trim()) return
    const url = `https://www.google.com/search?q=site:news.alllivesmatter.world+${encodeURIComponent(query.trim())}`
    window.open(url, '_blank', 'noopener')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <span className="search-modal-title">Search Duker News</span>
          <button
            className="bg-transparent border-none cursor-pointer rounded px-1.5 py-0.5 text-base leading-none transition-colors"
            style={{ color: 'var(--duki-400)' }}
            onClick={onClose}
          >✕</button>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            handleSearch()
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles, discussions…"
            className="search-modal-input"
          />
          <button
            type="submit"
            className="search-modal-submit"
            disabled={!query.trim()}
          >
            Search
          </button>
        </form>
        <p className="mt-3 text-xs text-center" style={{ color: 'var(--duki-600)' }}>
          Powered by Google · site:news.alllivesmatter.world
        </p>
      </div>
    </div>
  )
}

export default function Header() {
  const location = useLocation()
  const { locale, setLocale, currentEntry } = useLocale()
  const [langOpen, setLangOpen] = useState(false)
  const [langFilter, setLangFilter] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const { authStatus, me } = useAuthStore()
  const routeContext = useRouteContext({ from: '__root__' }) as { auth?: { username?: string; ego?: string } | null }
  const langInputRef = useRef<HTMLInputElement>(null)

  // Auth username: prefer client (post-hydration), fallback to SSR context
  const authUsername = me?.username || routeContext.auth?.username || ''
  const isLoggedIn = !!(me?.username || routeContext.auth?.username)

  // Filter navLinks: only show auth-required links when logged in
  const visibleLinks = navLinks.filter(link => !link.auth || isLoggedIn)

  // Focus search input when dropdown opens
  useEffect(() => {
    if (langOpen) {
      setTimeout(() => langInputRef.current?.focus(), 50)
    } else {
      setLangFilter('')
    }
  }, [langOpen])

  const filteredLocales = langFilter
    ? LOCALES.filter(e =>
      e.native.toLowerCase().includes(langFilter.toLowerCase()) ||
      e.locale.toLowerCase().includes(langFilter.toLowerCase())
    )
    : LOCALES

  return (
    <>
      <header
        className="z-50 md:mt-2"
        style={{ background: 'var(--duki-700)' }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: '6px', padding: '2px 10px', fontSize: '12px' }}>
          {/* ── Col 1: Logo — large on mobile, smaller on desktop ── */}
          <Link to="/dao" className="no-underlinehover:opacity-80 transition-opacity" aria-label="DAO"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="block md:hidden"><DukerLogo size={28} /></span>
            <span className="hidden md:block"><DukerLogo size={16} /></span>
          </Link>

          {/* ── Col 2: Brand + Nav ── */}
          {/* Mobile: "Duker News" on row 1, nav wraps on row 2 */}
          {/* Desktop: everything flows inline after "Duker News" */}
          <div className="flex flex-col md:flex-row md:items-center md:flex-wrap md:gap-0">
            <Link to="/" className="no-underline shrink-0 mr-3 inline-flex items-center">
              <b className="text-sm text-purple-500">Duker News</b>
              <span className="px-0.5  rounded-md bg-gray-500 text-[7px] font-medium text-white tracking-wider border border-primary/20 ml-1">BETA</span>
            </Link>

            <nav className="flex items-center flex-wrap py-[1px]">
              {visibleLinks.map((link, index) => {
                const isActive = location.pathname === link.to
                return (
                  <span key={link.to}>
                    {index > 0 && (
                      <span className="select-none" style={{ color: 'var(--duki-600)', margin: '0 2px' }}>|</span>
                    )}
                    <Link
                      to={link.to as any}
                      search={link.to === '/threads' ? { id: authUsername } as any : undefined}
                      className={`hn-nav-link ${isActive ? 'active' : ''}`}
                    >
                      {link.msg()}
                    </Link>
                  </span>
                )
              })}
              {/* Dynamic context item based on current route */}
              {(() => {
                const path = location.pathname
                const search = (location.search || {}) as Record<string, string | undefined>
                const contextId = search.id || ''

                type ContextRoute = { path: string; label: string }
                const contextRoutes: ContextRoute[] = [
                  { path: '/submitted', label: 'submissions' },
                  { path: '/upvoted', label: 'upvoted' },
                  { path: '/favorites', label: 'favorites' },
                ]

                const match = contextRoutes.find(r => path === r.path)
                if (match) {
                  return (
                    <span>
                      <span className="select-none" style={{ color: 'var(--duki-600)', margin: '0 2px' }}>|</span>
                      <span className="hn-nav-link active" style={{ cursor: 'default' }}>
                        {contextId ? `${match.label}(${contextId.length > 12 ? contextId.slice(0, 6) + '…' + contextId.slice(-4) : contextId})` : match.label}
                      </span>
                    </span>
                  )
                }

                if (path === '/past') {
                  const yesterday = new Date()
                  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
                  const date = search.date || yesterday.toISOString().slice(0, 10)
                  return (
                    <span>
                      <span className="select-none" style={{ color: 'var(--duki-600)', margin: '0 2px' }}>|</span>
                      <span className="hn-nav-link active" style={{ cursor: 'default' }}>
                        {date}
                      </span>
                    </span>
                  )
                }

                if (path === '/user') {
                  return (
                    <span>
                      <span className="select-none" style={{ color: 'var(--duki-600)', margin: '0 2px' }}>|</span>
                      <span className="hn-nav-link active" style={{ cursor: 'default' }}>
                        {contextId ? `${contextId.length > 12 ? contextId.slice(0, 6) + '…' + contextId.slice(-4) : contextId}` : 'profile'}
                      </span>
                    </span>
                  )
                }

                // Threads page: show "{username}'s comments" when viewing another user's threads
                // Skip during SSR/loading (authStatus='loading') to avoid flash.
                // After hydration: show if not logged in, or logged in as a different user.
                if (path === '/threads' && contextId && authStatus !== 'loading') {
                  const isOwnThreads = authStatus === 'authenticated' && me?.username === contextId
                  if (!isOwnThreads) {
                    return (
                      <span>
                        <span className="select-none" style={{ color: 'var(--duki-600)', margin: '0 2px' }}>|</span>
                        <span className="hn-nav-link active" style={{ cursor: 'default' }}>
                          {contextId}'s comments
                        </span>
                      </span>
                    )
                  }
                }

                return null
              })()}
            </nav>
          </div>

          {/* ── Col 3: Right items — 2x2 on mobile, 1x4 on desktop ── */}
          <div className="grid grid-cols-2 gap-1 md:flex md:items-center md:gap-1.5">
            {/* Search trigger — disabled for now
            <button
              onClick={() => setSearchOpen(true)}
              className="hn-header-icon"
              title="Search"
              aria-label="Search"
            >
              <SearchIcon size={14} />
            </button>
            */}

            {/* Language switcher — disabled until localization is ready
            <div className="relative">
              <button
                onClick={() => setLangOpen(!langOpen)}
                className="hn-header-icon"
                title="Language"
                style={{ fontSize: '10px', fontWeight: 600, minWidth: '28px', textAlign: 'center' }}
              >
                {currentEntry.locale.split(/[-_]/)[0].toUpperCase()}
              </button>
              {langOpen && (
                <>
                  <div
                    className="fixed inset-0"
                    onClick={() => setLangOpen(false)}
                    style={{ zIndex: 40 }}
                  />
                  <div
                    className="absolute right-0 mt-1 rounded-lg shadow-lg overflow-hidden"
                    style={{
                      background: 'var(--duki-800)',
                      border: '1px solid var(--duki-600)',
                      zIndex: 50,
                      width: '240px',
                    }}
                  >
                    <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--duki-700)' }}>
                      <input
                        ref={langInputRef}
                        type="text"
                        value={langFilter}
                        onChange={e => setLangFilter(e.target.value)}
                        placeholder="Search language…"
                        style={{
                          width: '100%',
                          background: 'var(--duki-900)',
                          border: '1px solid var(--duki-600)',
                          borderRadius: '4px',
                          color: 'var(--duki-100)',
                          fontSize: '11px',
                          padding: '4px 8px',
                          outline: 'none',
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>
                    <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                      {filteredLocales.map((entry) => (
                        <button
                          key={entry.locale}
                          onClick={() => {
                            setLocale(entry.locale)
                            setLangOpen(false)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            width: '100%',
                            textAlign: 'left',
                            padding: '6px 10px',
                            border: 'none',
                            background: entry.locale === locale ? 'var(--duki-600)' : 'transparent',
                            color: entry.locale === locale ? 'var(--duki-100)' : 'var(--duki-300)',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontFamily: 'inherit',
                            transition: 'background 0.1s',
                          }}
                          onMouseEnter={e => {
                            if (entry.locale !== locale)
                              (e.target as HTMLElement).style.background = 'var(--duki-700)'
                          }}
                          onMouseLeave={e => {
                            if (entry.locale !== locale)
                              (e.target as HTMLElement).style.background = 'transparent'
                          }}
                        >
                          <span style={{ fontSize: '14px', lineHeight: 1, width: '20px', textAlign: 'center' }}>{entry.flag}</span>
                          <span style={{ fontWeight: 500, flex: 1 }}>{entry.native}</span>
                          <span style={{ opacity: 0.5, fontSize: '10px', fontFamily: 'monospace' }}>{entry.locale}</span>
                        </button>
                      ))}
                      {filteredLocales.length === 0 && (
                        <div style={{ padding: '12px', textAlign: 'center', color: 'var(--duki-500)', fontSize: '11px' }}>
                          No results
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            */}

            {/* Wallet Connect */}
            <WalletButton />
          </div>
        </div>
      </header>

      {/* Search modal — disabled for now
      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      */}
    </>
  )
}
