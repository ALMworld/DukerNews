import { createStart } from '@tanstack/react-start'
import { protoAdapter } from './lib/proto-adapter'
import { loggingMiddleware, authMiddleware } from './middleware'

export const startInstance = createStart(() => ({
    defaultSsr: true,
    serializationAdapters: [protoAdapter],
    requestMiddleware: [loggingMiddleware, authMiddleware],
}))
