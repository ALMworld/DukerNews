/**
 * POST /api/auth/nonce — Generate a random nonce for SIWE.
 */
import { createFileRoute } from '@tanstack/react-router'
import { storeNonce } from '../../../server/auth-utils'

export const Route = createFileRoute('/api/auth/nonce')({
    server: {
        handlers: {
            POST: async () => {
                const bytes = crypto.getRandomValues(new Uint8Array(32))
                const nonce = Array.from(bytes)
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join('')

                storeNonce(nonce)

                return Response.json({
                    success: true,
                    message: 'Nonce generated',
                    data: { nonce },
                })
            },
        },
    },
})
