import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: './tests',
    testMatch: ['e2e-sepolia-ui.spec.ts', 'e2e-sepolia-x402.spec.ts'],
    timeout: 300_000,      // 5 min per test (Sepolia tx are slow)
    expect: { timeout: 30_000 },
    fullyParallel: false,   // sequential — tests share state
    workers: 1,
    retries: 0,
    reporter: [['list']],
    use: {
        baseURL: 'http://localhost:3000',
        channel: 'chrome',  // use system Chrome — no separate download needed
        headless: false,     // visible for debugging; set true for CI
        viewport: { width: 1280, height: 800 },
        actionTimeout: 15_000,
        trace: 'on-first-retry',
    },
    // Dev server — Playwright manages start/stop
    webServer: {
        command: 'pnpm dev',
        port: 3000,
        reuseExistingServer: true,  // reuse if already running
        timeout: 30_000,
    },
})
