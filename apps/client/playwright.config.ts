import { defineConfig } from '@playwright/test';

/**
 * End-to-end test of district 1 (M2b) on a phone viewport with the GPS simulator.
 * Runs against a production build served by `vite preview` (no spawn service needed).
 * Locally, PW_CHANNEL=msedge (or chrome) uses an installed browser instead of the
 * Playwright download.
 */
const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 6 * 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    channel: process.env.PW_CHANNEL || undefined,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'en-GB',
    geolocation: { latitude: 55.4017, longitude: 10.3866 },
    permissions: ['geolocation'],
    // off: a trace of the long map tests (hundreds of mouse moves on a live WebGL map)
    // exhausted the test runner's memory in CI; failure screenshots are kept
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    port: PORT,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: { VITE_SPAWN_SERVICE_URL: '' },
  },
});
