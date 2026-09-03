import { expect, type Page } from '@playwright/test';

export const OWNER_PHONE = '+919999900001';
export const STAFF_PHONE = '+919999900003';
export const DEMO_OTP = '123456';

/** Signs in through the real OTP form; demo mode accepts the local test code. */
export async function signIn(page: Page, phone = OWNER_PHONE): Promise<void> {
  await page.goto('/sign-in');
  await page.getByTestId('identifier-input').fill(phone);
  await page.getByTestId('send-code').click();
  await page.getByTestId('otp-input').fill(DEMO_OTP);
  await page.getByTestId('verify-otp').click();
}

/** Signs in and waits for the composer to be ready on the home screen. */
export async function signInToComposer(page: Page, phone = OWNER_PHONE): Promise<void> {
  await signIn(page, phone);
  await expect(page.getByTestId('amount-input')).toBeVisible();
}

/** Wipes the browser-local dataset so each test starts from the same seed. */
export async function resetDemoData(page: Page): Promise<void> {
  await page.goto('/sign-in');
  await page.evaluate(() => {
    window.localStorage.clear();
    return indexedDB.deleteDatabase('keyval-store');
  });
  await page.reload();
}

export function parseMinorFromCurrency(text: string): number {
  const digits = text.replace(/[^\d.]/g, '');
  return Math.round(Number(digits) * 100);
}

/**
 * The month header is fed by its own query; reading the three totals before it
 * resolves would compare a loaded value against a placeholder zero.
 */
export async function waitForMonthTotals(
  page: Page,
): Promise<{ income: number; expense: number; net: number }> {
  await expect(page.getByTestId('category-breakdown')).toBeVisible();
  await expect
    .poll(async () => parseMinorFromCurrency((await page.getByTestId('month-expense').textContent()) ?? '0'))
    .toBeGreaterThan(0);

  const read = async (testId: string) =>
    parseMinorFromCurrency((await page.getByTestId(testId).textContent()) ?? '0');
  return { income: await read('month-income'), expense: await read('month-expense'), net: await read('month-net') };
}

