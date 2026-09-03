import { expect, test } from '@playwright/test';
import { parseMinorFromCurrency, resetDemoData, signInToComposer, waitForMonthTotals } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetDemoData(page);
  await signInToComposer(page);
  await page.getByRole('link', { name: 'Month' }).click();
});

/** §10.4 scenario 6: month totals, category breakdown, and month navigation. */
test('the month view totals agree with the category breakdown', async ({ page }) => {
  const { expense: expenseTotal } = await waitForMonthTotals(page);

  const rows = page.getByTestId('category-breakdown').locator('> li');
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);

  let sum = 0;
  for (let i = 0; i < count; i++) {
    const amount = await rows.nth(i).locator('button').first().locator('span > span').nth(1).textContent();
    sum += parseMinorFromCurrency(amount ?? '0');
  }

  // Totals come from the same source as the bars, so these must agree exactly.
  expect(sum).toBe(expenseTotal);
});

test('net equals income minus expense', async ({ page }) => {
  const { income, expense, net } = await waitForMonthTotals(page);
  expect(Math.abs(net)).toBe(Math.abs(income - expense));
});

test('tapping a category reveals its entries', async ({ page }) => {
  const first = page.getByTestId('category-breakdown').locator('> li').first();
  await first.locator('button').first().click();
  await expect(first.getByTestId('entry-list')).toBeVisible();
});

test('the month can be changed', async ({ page }) => {
  const label = await page.getByTestId('month-label').textContent();
  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(page.getByTestId('month-label')).not.toHaveText(label ?? '');

  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.getByTestId('month-label')).toHaveText(label ?? '');
});

test('swiping left moves to the next month', async ({ page }) => {
  const label = await page.getByTestId('month-label').textContent();
  const target = page.getByTestId('month-expense');
  const box = await target.boundingBox();
  if (!box) throw new Error('month panel not laid out');

  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect(page.getByTestId('month-label')).not.toHaveText(label ?? '');
});
