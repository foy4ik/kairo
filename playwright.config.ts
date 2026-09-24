import { defineConfig } from '@playwright/test'

/**
 * E2E runs the real React app in a browser against the in-memory backend (same IPC contract as the Rust core,
 * which is covered separately by `cargo test`). Uses the system Edge, so no browser download is needed.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:1420',
    channel: process.env.PW_CHANNEL ?? 'msedge',
    viewport: { width: 1280, height: 800 },
    locale: 'ru-RU',
    trace: 'retain-on-failure',
  },
  // The web-demo spec runs against a second dev server started with the demo flag (banner, phone notice, no updater card).
  projects: [
    { name: 'app', testIgnore: /demo\.spec\.ts/ },
    { name: 'demo', testMatch: /demo\.spec\.ts/, use: { baseURL: 'http://127.0.0.1:1421' } },
  ],
  webServer: [
    { command: 'npm run dev', url: 'http://127.0.0.1:1420', reuseExistingServer: true, timeout: 60_000 },
    {
      command: 'npx vite --host 127.0.0.1 --port 1421 --strictPort',
      url: 'http://127.0.0.1:1421',
      env: { VITE_WEB_DEMO: '1' },
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
})
