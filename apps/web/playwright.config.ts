import { defineConfig, devices } from '@playwright/test';

/**
 * §10.4 runs on a Pixel 7 mobile viewport and on desktop.
 *
 * The suite drives demo mode: the same components, the same parser, the same
 * repository interface, against a browser-local dataset. That is what lets CI
 * run the whole suite without Docker; see docs/DECISIONS.md.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3210',
    trace: 'on-first-retry',
    video: process.env.RECORD_VIDEO === '1' ? 'on' : 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'NEXT_PUBLIC_DEMO_MODE=1 npx next start -p 3210',
    url: 'http://127.0.0.1:3210/sign-in',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
