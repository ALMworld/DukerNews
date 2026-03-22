import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuthStore } from '../lib/authStore'
import * as m from '../paraglide/messages.js'
import SubmitForm from '../components/submit/SubmitForm'

export const Route = createFileRoute('/submit')({
  component: SubmitPage,
})

function SubmitPage() {
  const { authStatus, me, setConnectModalOpen } = useAuthStore()

  const isLoggedIn = authStatus === 'authenticated' && !!me
  const needsUsername = isLoggedIn && !me?.username

  // Not logged in or no username → auto-open the Connect & Sign In modal
  useEffect(() => {
    if (!isLoggedIn || needsUsername) {
      setConnectModalOpen(true)
    }
  }, [isLoggedIn, needsUsername, setConnectModalOpen])

  // Not ready to submit → show prompt + button to reopen modal
  if (!isLoggedIn || needsUsername) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--meta-color)', marginBottom: 16 }}>
            {needsUsername ? m.submit_mint_hint() : m.submit_signin_hint()}
          </p>
          <button
            type="button"
            onClick={() => setConnectModalOpen(true)}
            style={{
              padding: '8px 20px', borderRadius: 8, fontSize: 13,
              fontWeight: 500, cursor: 'pointer',
              background: 'var(--muted)',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
            }}
          >
            {needsUsername ? m.submit_mint_btn() : m.submit_signin_btn()}
          </button>
        </div>
      </div>
    )
  }

  return <SubmitForm />
}
