import { defineConfig, devices } from '@playwright/test';

/**
 * A smoke suite that runs the app against the real Supabase local stack, so the
 * SupabaseRepo, RLS-from-the-browser and Realtime paths are exercised too.
 * Requires `supabase start`; the main suite in playwright.config.ts does not.
 */
export default defineConfig({
  testDir: './e2e-supabase',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3310', trace: 'retain-on-failure' },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'npx next start -p 3310',
    url: 'http://127.0.0.1:3310/sign-in',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
