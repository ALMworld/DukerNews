/**
 * Vitest config for e2e tests — uses Node.js environment, not browser/worker.
 * Excludes app source files from transformation to avoid module resolution issues.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment:  'node',
        include:      ['draft/tests/e2e-*.ts', 'draft/tests/seed-*.ts'],
        testTimeout:  360_000,  // 6 min — Sepolia tx can be slow
        hookTimeout:  120_000,
        reporters:    ['verbose'],
        pool:         'forks',  // avoid ESM/CJS conflicts in workers
        poolOptions: {
            forks: {
                singleFork: true,  // tests share state (postId → commentId → boost)
            },
        },
    },
})
