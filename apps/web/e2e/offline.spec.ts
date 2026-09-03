import { expect, test } from '@playwright/test';
import { resetDemoData, signInToComposer } from './helpers';

/** §10.4 scenario 5: entries made offline queue once and sync once. */
test('entries created offline queue and then sync exactly once', async ({ page, context }) => {
  await resetDemoData(page);
  await signInToComposer(page);

  const rowsBefore = await page.getByTestId('entry-row').count();

  await context.setOffline(true);
  await expect(page.getByTestId('offline-indicator')).toBeVisible();

  await page.getByTestId('amount-input').fill('111');
  await page.getByTestId('note-input').fill('offline one');
  await page.getByTestId('save-entry').click();

  await page.getByTestId('amount-input').fill('222');
  await page.getByTestId('note-input').fill('offline two');
  await page.getByTestId('save-entry').click();

  await expect(page.getByTestId('sync-pill')).toContainText('2 entries waiting to sync');

  await context.setOffline(false);

  await expect(page.getByTestId('sync-pill')).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText('offline one')).toHaveCount(1);
  await expect(page.getByText('offline two')).toHaveCount(1);

  // A reload must not replay the queue and duplicate anything.
  await page.reload();
  await expect(page.getByTestId('amount-input')).toBeVisible();
  await expect(page.getByText('offline two')).toHaveCount(1);
  expect(await page.getByTestId('entry-row').count()).toBeGreaterThanOrEqual(Math.min(rowsBefore, 5));
});

/** §4.7: the shell and recent entries stay readable with no network. */
test('the ledger is readable while offline', async ({ page, context }) => {
  await resetDemoData(page);
  await signInToComposer(page);
  await expect(page.getByTestId('entry-row').first()).toBeVisible();

  await context.setOffline(true);
  await page.getByRole('link', { name: 'Month' }).click();
  await expect(page.getByTestId('month-expense')).toBeVisible();
  await expect(page.getByTestId('category-breakdown')).toBeVisible();
});
