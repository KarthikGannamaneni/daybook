import { expect, test } from '@playwright/test';
import { DEMO_OTP, resetDemoData } from './helpers';

/** §10.4 scenario 1: a brand new user reaches the composer in three steps. */
test('a new user completes onboarding and lands on the focused composer', async ({ page }) => {
  await resetDemoData(page);

  const started = Date.now();

  await page.goto('/sign-in');
  await page.getByTestId('identifier-input').fill('+919888800123');
  await page.getByTestId('send-code').click();
  await page.getByTestId('otp-input').fill(DEMO_OTP);
  await page.getByTestId('verify-otp').click();

  // Step 1: name.
  await expect(page.getByTestId('business-name')).toBeVisible();
  await page.getByTestId('business-name').fill('Nagar Print Shop');
  await page.getByTestId('onboarding-next').click();

  // Step 2: currency and format.
  await page.getByTestId('currency-INR').click();
  await page.getByTestId('onboarding-next').click();

  // Step 3: opening cash.
  await page.getByTestId('starting-balance').fill('2500');
  await page.getByTestId('onboarding-finish').click();

  // Lands on the composer, focused, with the numeric keypad requested.
  const amount = page.getByTestId('amount-input');
  await expect(amount).toBeVisible();
  await expect(amount).toBeFocused();
  await expect(amount).toHaveAttribute('inputmode', 'decimal');

  // §4.2: the whole flow completes in well under 30 seconds of interaction.
  expect(Date.now() - started).toBeLessThan(30_000);

  // Default categories and accounts were seeded.
  await expect(page.getByTestId('category-chip').filter({ hasText: 'Food & Tea' })).toBeVisible();
  await expect(page.getByTestId('account-chip').filter({ hasText: 'Cash' })).toBeVisible();
});

test('the app opens straight to the composer on a return visit', async ({ page }) => {
  await resetDemoData(page);
  await page.goto('/sign-in');
  await page.getByTestId('identifier-input').fill('+919999900001');
  await page.getByTestId('send-code').click();
  await page.getByTestId('otp-input').fill(DEMO_OTP);
  await page.getByTestId('verify-otp').click();

  await expect(page.getByTestId('amount-input')).toBeFocused();

  await page.reload();
  await expect(page.getByTestId('amount-input')).toBeVisible();
  await expect(page.getByTestId('amount-input')).toBeFocused();
});
