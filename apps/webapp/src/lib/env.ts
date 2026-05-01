/**
 * env.ts — Vite build-time environment constants.
 *
 * Vite replaces these with literal true/false at build time, so any
 * `if (IS_DEV) { ... }` block is fully tree-shaken from production bundles.
 *
 * Usage:
 *   import { IS_DEV } from '@/lib/env'
 *   if (IS_DEV) { ... }  // removed from prod build
 */

export const IS_DEV  = import.meta.env.DEV
export const IS_PROD = import.meta.env.PROD
export const MODE    = import.meta.env.MODE
