import { expect, test } from '@playwright/test';
import { resetDemoData, signInToComposer } from './helpers';

/**
 * §14 deliverable 5: recordings of scenario 2 (three-tap repeat expense) and
 * scenario 7 (WhatsApp round trip). Videos land in test-results/ and are
 * uploaded as CI artifacts.
 */
test.use({ video: 'on' });

test('recording: a repeat expense in three taps', async ({ page }) => {
  await resetDemoData(page);
  await signInToComposer(page);
  await page.waitForTimeout(600);

  await page.getByTestId('quick-chip').first().click();
  await page.waitForTimeout(400);
  await page.getByTestId('save-entry').click();

  await expect(page.getByTestId('entry-list')).toBeVisible();
  await page.waitForTimeout(1200);
});

test('recording: a WhatsApp message becomes an entry', async ({ page }) => {
  await resetDemoData(page);
  await signInToComposer(page);
  await page.waitForFunction(() => Boolean((window as never as { __khataDemo?: unknown }).__khataDemo));
  await page.waitForTimeout(600);

  await page.evaluate(() =>
    (window as never as { __khataDemo: { simulateInbound: (b: string) => Promise<string | null> } }).__khataDemo.simulateInbound(
      '450 tea shop',
    ),
  );

  await expect(page.getByTestId('entry-row').first()).toContainText('tea shop', { timeout: 3_000 });
  await page.waitForTimeout(1500);
});
