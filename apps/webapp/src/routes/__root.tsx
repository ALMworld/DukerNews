import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import React, { useState, useEffect } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { wagmiConfig } from '../lib/wagmi-config'

import Header from '../components/Header'
import Footer from '../components/Footer'
import { LocaleProvider, useLocale } from '../lib/locale-context'
import { ThemeProvider } from '../lib/theme-context'

import appCss from '../styles.css?url'

import type { JWTPayload } from '../server/auth-utils'

/**
 * Server function to read auth from JWT cookie during SSR.
 * createServerFn guarantees this runs on the server with request context.
 */
const getServerAuth = createServerFn({ method: 'GET' }).handler(
  async (): Promise<JWTPayload | null> => {
    try {
      const request = getRequest()
      const { verifyJwt, parseCookies, COOKIE_NAME } = await import('../server/auth-utils')
      const cookieHeader = request.headers.get('cookie') || ''
      const cookies = parseCookies(cookieHeader)
      const token = cookies[COOKIE_NAME]
      if (!token) return null
      return await verifyJwt(token)
    } catch {
      return null
    }
  },
)

interface MyRouterContext {
  queryClient: QueryClient
  /** Auth from JWT cookie, populated by getServerAuth during SSR. */
  auth?: JWTPayload | null
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  beforeLoad: async () => {
    // Only read JWT cookie during SSR. After hydration, Header reads from Zustand.
    if (typeof window !== 'undefined') return { auth: null }
    const auth = await getServerAuth()
    return { auth }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Duker News' },
      {
        name: 'description',
        content:
          'Duker News is a community for web3 products aligned with DUKI — Decentralized Universal Kindness Initiative.',
      },
    ],
    links: [
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'stylesheet', href: appCss },
    ],
    scripts: [
      {
        // Anti-flash: apply theme class before first paint
        children: `(function(){try{var t=localStorage.getItem('theme');if(t==='light'||(t==='system'&&window.matchMedia('(prefers-color-scheme:light)').matches))document.documentElement.classList.add('light')}catch(e){}})()`,
      },
    ],
  }),

  component: RootComponent,
})

/**
 * Client-only ConnectModal wrapper — lazy-loaded to avoid SSR issues.
 */
function LazyConnectModal() {
  const [Modal, setModal] = useState<React.ComponentType | null>(null)

  useEffect(() => {
    import('../components/ConnectModal').then(({ ConnectModal }) => {
      setModal(() => ConnectModal)
    })
  }, [])

  // We need to read the store on client side to decide whether to show
  const [open, setOpen] = useState(false)
  useEffect(() => {
    import('../lib/authStore').then(({ useAuthStore }) => {
      // Subscribe to store changes
      const unsub = useAuthStore.subscribe(
        (state) => {
          setOpen(state.connectModalOpen)
        }
      )
      // Read initial state
      setOpen(useAuthStore.getState().connectModalOpen)
      return unsub
    })
  }, [])

  if (!Modal || !open) return null
  return <Modal />
}



function RootLayout() {
  const { locale } = useLocale();
  return (
    <ThemeProvider>
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--page-bg)' }}>
        <div className="w-full md:w-[85%] mx-auto flex-1 flex flex-col" style={{ background: 'var(--background)' }}>
          <Header /> {/* SHould always in the hn-container . DO NOT MOVE IT */}
          <div className="flex-1 flex flex-col md:border-x" style={{ borderColor: 'var(--border)' }} key={locale}>
            <main className="flex-1">
              <Outlet />
            </main>
            <Footer />
          </div>
        </div>
      </div>
      <LazyConnectModal />
    </ThemeProvider>
  )
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext()
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <LocaleProvider>
              <RootLayout />
            </LocaleProvider>
          </QueryClientProvider>
        </WagmiProvider>
        <Scripts />
      </body>
    </html>
  )
}
