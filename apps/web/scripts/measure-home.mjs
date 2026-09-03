#!/usr/bin/env node
/**
 * §10.6: LCP for the home screen on a simulated slow 4G connection.
 *
 * Lighthouse loads `/` signed out, which redirects to sign-in — a useful number,
 * but not the screen the budget is about. This measures what a returning shop
 * owner actually sees: the app opening straight onto the composer, with the
 * session already established, under Slow 4G and a 4x CPU throttle.
 *
 * Usage: node scripts/measure-home.mjs [baseURL]
 */
import { chromium, devices } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3400';
const LCP_BUDGET_MS = 1500;

// Lighthouse's "Slow 4G" throttle.
const SLOW_4G = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
};

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['Pixel 7'] });
const page = await context.newPage();

// Establish the session the way a real returning user already has one.
await page.goto(`${BASE}/sign-in`);
await page.getByTestId('identifier-input').fill('+919999900001');
await page.getByTestId('send-code').click();
await page.getByTestId('otp-input').fill('123456');
await page.getByTestId('verify-otp').click();
await page.getByTestId('amount-input').waitFor();

// LCP is only observable through a PerformanceObserver, and it has to be
// installed before the document runs.
await context.addInitScript(() => {
  window.__lcp = { time: 0, tag: null };
  new PerformanceObserver((list) => {
    const last = list.getEntries().at(-1);
    if (last) {
      window.__lcp = { time: last.startTime, tag: last.element?.tagName ?? null };
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
});

// Now load the home screen cold, throttled, with no HTTP cache.
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

await page.goto(`${BASE}/`, { waitUntil: 'load' });
await page.getByTestId('amount-input').waitFor({ timeout: 60_000 });
await page.waitForTimeout(2000);

const metrics = await page.evaluate(() => {
  const paint = performance.getEntriesByType('paint');
  const nav = performance.getEntriesByType('navigation')[0];
  return {
    ttfb: nav?.responseStart ?? 0,
    fcp: paint.find((p) => p.name === 'first-contentful-paint')?.startTime ?? 0,
    lcp: window.__lcp?.time ?? 0,
    lcpElement: window.__lcp?.tag ?? null,
    domContentLoaded: nav?.domContentLoadedEventEnd ?? 0,
  };
});

await browser.close();

const row = (label, value) => console.log(`${label.padEnd(24)} ${Math.round(value)} ms`);
console.log('Home screen, Pixel 7, Slow 4G + 4x CPU throttle, signed in\n');
row('TTFB', metrics.ttfb);
row('First contentful paint', metrics.fcp);
row('Largest contentful paint', metrics.lcp);
row('DOMContentLoaded', metrics.domContentLoaded);
console.log(`${'LCP element'.padEnd(24)} <${(metrics.lcpElement ?? '?').toLowerCase()}>`);
console.log(`\nLCP budget ${LCP_BUDGET_MS} ms — ${metrics.lcp <= LCP_BUDGET_MS ? 'PASS' : 'OVER'}`);

if (metrics.lcp > LCP_BUDGET_MS) process.exitCode = 1;
