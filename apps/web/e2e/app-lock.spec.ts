import { expect, test } from '@playwright/test';
import { resetDemoData, signInToComposer } from './helpers';

/**
 * §10.4 scenario 9: with the PIN set, coming back to the foreground after five
 * minutes shows the lock screen.
 */
test('the app locks after five minutes in the background', async ({ page }) => {
  await page.clock.install();
  await resetDemoData(page);
  await signInToComposer(page);

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByTestId('set-pin').click();
  await page.getByTestId('pin-input').fill('1357');
  await page.getByTestId('pin-save').click();
  await expect(page.getByTestId('lock-indicator')).toBeVisible();

  // Background the app, wait past the five-minute window, come back.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward('06:00');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await expect(page.getByTestId('lock-screen')).toBeVisible();

  await page.getByTestId('lock-pin').fill('9999');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('That PIN is not right.')).toBeVisible();

  await page.getByTestId('lock-pin').fill('1357');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByTestId('lock-screen')).toHaveCount(0);
});

test('a short absence does not lock the app', async ({ page }) => {
  await page.clock.install();
  await resetDemoData(page);
  await signInToComposer(page);

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByTestId('set-pin').click();
  await page.getByTestId('pin-input').fill('2468');
  await page.getByTestId('pin-save').click();
  await expect(page.getByTestId('lock-indicator')).toBeVisible();

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward('00:30');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await expect(page.getByTestId('lock-screen')).toHaveCount(0);
});
