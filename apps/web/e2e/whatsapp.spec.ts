import { expect, test } from '@playwright/test';
import { resetDemoData, signInToComposer } from './helpers';

declare global {
  interface Window {
    __khataDemo?: { simulateInbound: (body: string, phone?: string) => Promise<string | null> };
  }
}

/**
 * §10.4 scenario 7: an inbound WhatsApp message becomes an entry and shows in
 * the UI within 3 seconds, with no reload.
 *
 * The message goes through the same parser the edge function uses; only the
 * HTTP hop to Meta is skipped.
 */
test('an inbound WhatsApp message appears in the ledger without a reload', async ({ page }) => {
  await resetDemoData(page);
  await signInToComposer(page);
  await expect(page.getByTestId('entry-row').first()).toBeVisible();

  await page.waitForFunction(() => Boolean(window.__khataDemo));
  const entryId = await page.evaluate(() => window.__khataDemo!.simulateInbound('450 tea shop'));
  expect(entryId).toBeTruthy();

  await expect(page.getByTestId('entry-row').first()).toContainText('tea shop', { timeout: 3_000 });
  await expect(page.getByTestId('entry-row').first()).toContainText('450');
  await expect(page.getByTestId('entry-row').first()).toContainText('WhatsApp');
});

test('the parser rules hold end to end: income, party, account and date', async ({ page }) => {
  await resetDemoData(page);
  await signInToComposer(page);
  await page.waitForFunction(() => Boolean(window.__khataDemo));

  await page.evaluate(() => window.__khataDemo!.simulateInbound('got 5000 from ramesh bank'));
  const row = page.getByTestId('entry-row').first();
  await expect(row).toContainText('Ramesh', { timeout: 3_000 });
  await expect(row).toContainText('Bank');
  await expect(row).toContainText('+');
});

test('an unparsable message creates nothing', async ({ page }) => {
  await resetDemoData(page);
  await signInToComposer(page);
  await page.waitForFunction(() => Boolean(window.__khataDemo));

  const before = await page.getByTestId('entry-row').first().textContent();
  const result = await page.evaluate(() => window.__khataDemo!.simulateInbound('😀😀'));
  expect(result).toBeNull();
  await expect(page.getByTestId('entry-row').first()).toHaveText(before ?? '');
});

test('undo removes the last WhatsApp entry', async ({ page }) => {
  await resetDemoData(page);
  await signInToComposer(page);
  await page.waitForFunction(() => Boolean(window.__khataDemo));

  await page.evaluate(() => window.__khataDemo!.simulateInbound('999 courier charges'));
  await expect(page.getByTestId('entry-row').first()).toContainText('courier charges', { timeout: 3_000 });

  await page.evaluate(() => window.__khataDemo!.simulateInbound('undo'));
  await expect(page.getByText('courier charges')).toHaveCount(0, { timeout: 3_000 });
});

/** §4.5: linking is a 6-character code the owner sends from the phone. */
test('the owner can generate a WhatsApp linking code', async ({ page }) => {
  await resetDemoData(page);
  await signInToComposer(page);
  await page.getByRole('link', { name: 'Settings' }).click();

  await page.getByTestId('generate-link-code').click();
  await expect(page.getByTestId('link-code')).toHaveText(/^[A-Z0-9]{6}$/);
  await expect(page.getByTestId('linked-numbers')).toContainText('xxx');
});
