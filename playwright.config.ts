import { defineConfig } from '@playwright/test'

/**
 * E2E runs the real React app in a browser against the in-memory backend (same IPC contract as the Rust core,
 * which is covered separately by `cargo test`). Uses the system Edge, so no browser download is needed.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:1420',
    channel: process.env.PW_CHANNEL ?? 'msedge',
    viewport: { width: 1280, height: 800 },
    locale: 'ru-RU',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:1420',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
