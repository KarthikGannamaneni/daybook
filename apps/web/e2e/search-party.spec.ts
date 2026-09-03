import { expect, test } from '@playwright/test';
import { resetDemoData, signInToComposer } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetDemoData(page);
  await signInToComposer(page);
});

/** §4.4: one box over note, party and amount, results grouped by date. */
test('search finds entries by note', async ({ page }) => {
  await page.getByRole('link', { name: 'Search' }).click();
  await page.getByTestId('search-input').fill('tea');
  await expect(page.getByTestId('entry-list').first()).toBeVisible();
  // Search spans note, party and category, so a "Food & Tea" row is a hit too.
  await expect(page.getByTestId('entry-row').first()).toContainText(/tea/i);
});

test('search finds entries by amount', async ({ page }) => {
  await page.getByTestId('amount-input').fill('1357');
  await page.getByTestId('note-input').fill('unique marker');
  await page.getByTestId('save-entry').click();
  await expect(page.getByTestId('entry-row').first()).toContainText('unique marker');

  await page.getByRole('link', { name: 'Search' }).click();
  await page.getByTestId('search-input').fill('1357');
  await expect(page.getByTestId('entry-row').first()).toContainText('unique marker');
});

test('search reports when nothing matches', async ({ page }) => {
  await page.getByRole('link', { name: 'Search' }).click();
  await page.getByTestId('search-input').fill('zzzzznothing');
  await expect(page.getByTestId('search-empty')).toBeVisible();
});

/** §4.4: the party view doubles as "how much have I paid this supplier". */
test('a party page shows the running total with that party', async ({ page }) => {
  await page.getByTestId('amount-input').fill('2500');
  await page.getByTestId('note-input').fill('paper stock');
  await page.getByTestId('party-input').fill('Ramesh Traders');
  await page.getByTestId('save-entry').click();

  const row = page.getByTestId('entry-row').filter({ hasText: 'paper stock' }).first();
  await row.getByRole('button').click();
  await page.getByRole('link', { name: 'Ramesh Traders' }).click();

  await expect(page.getByTestId('party-paid')).toBeVisible();
  await expect(page.getByTestId('party-received')).toBeVisible();
  await expect(page.getByTestId('entry-row').first()).toBeVisible();
});
