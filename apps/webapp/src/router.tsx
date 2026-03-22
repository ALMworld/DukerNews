// BigInt → Number for JSON.stringify (proto uses bigint for int64/uint64)
// Must be before any library code runs (React Query hashKey, etc.)
;(BigInt.prototype as any).toJSON = function () { return Number(this) }

import { createRouter } from '@tanstack/react-router'
import * as TanstackQuery from './integrations/tanstack-query/root-provider'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

// Create a new router instance
export const getRouter = () => {
  const rqContext = TanstackQuery.getContext()

  const router = createRouter({
    routeTree,
    context: {
      ...rqContext,
    },
    defaultPreload: 'intent',
    scrollRestoration: true,
    getScrollRestorationKey: (location) => location.pathname,
  })

  return router
}
