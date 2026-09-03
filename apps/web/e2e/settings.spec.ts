import { expect, test } from '@playwright/test';
import { OWNER_PHONE, resetDemoData, signInToComposer } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetDemoData(page);
  await signInToComposer(page, OWNER_PHONE);
  await page.getByRole('link', { name: 'Settings' }).click();
});

/** §4.2: seeded categories and accounts are editable. */
test('a category can be added and then used in the composer', async ({ page }) => {
  await page.getByTestId('new-category-name').fill('Packaging');
  await page.getByTestId('add-category').click();
  await expect(page.getByTestId('taxonomy-row').filter({ hasText: 'Packaging' })).toBeVisible();

  await page.getByRole('link', { name: 'Today' }).click();
  await expect(page.getByTestId('category-chip').filter({ hasText: 'Packaging' })).toBeVisible();
});

test('a category can be renamed', async ({ page }) => {
  await page.getByTestId('taxonomy-row').filter({ hasText: 'Marketing' }).click();
  await page.getByTestId('taxonomy-rename-input').fill('Ads & Promos');
  await page.getByTestId('taxonomy-rename-save').click();
  await expect(page.getByTestId('taxonomy-row').filter({ hasText: 'Ads & Promos' })).toBeVisible();
});

test('an archived category leaves the composer', async ({ page }) => {
  const row = page.getByTestId('taxonomy-row').filter({ hasText: 'Marketing' }).first();
  await row.locator('xpath=..').getByTestId('taxonomy-archive').click();
  await expect(page.getByTestId('taxonomy-row').filter({ hasText: 'Marketing' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Today' }).click();
  await expect(page.getByTestId('category-chip').filter({ hasText: 'Marketing' })).toHaveCount(0);
});

test('an account can be added and used', async ({ page }) => {
  await page.getByTestId('new-account-name').fill('Second Bank');
  await page.getByTestId('add-account').click();
  await expect(page.getByTestId('taxonomy-row').filter({ hasText: 'Second Bank' })).toBeVisible();

  await page.getByRole('link', { name: 'Today' }).click();
  await expect(page.getByTestId('account-chip').filter({ hasText: 'Second Bank' })).toBeVisible();
});

/** §4.1: destructive actions re-verify the person, not the session. */
test('export asks for the code again before downloading', async ({ page }) => {
  await page.getByTestId('export-csv').click();
  await expect(page.getByTestId('reauth-input')).toBeVisible();

  await page.getByTestId('reauth-input').fill('000000');
  await page.getByTestId('reauth-confirm').click();
  await expect(page.getByText('That code is not right.')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.getByTestId('reauth-input').fill('123456');
      await page.getByTestId('reauth-confirm').click();
    })(),
  ]);
  expect(download.suggestedFilename()).toContain('khata-');
});

test('unlinking a WhatsApp number re-verifies first', async ({ page }) => {
  await expect(page.getByTestId('linked-numbers')).toContainText('xxx');
  await page.getByTestId('unlink-number').first().click();
  await expect(page.getByTestId('reauth-input')).toBeVisible();

  await page.getByTestId('reauth-input').fill('123456');
  await page.getByTestId('reauth-confirm').click();
  await expect(page.getByTestId('linked-numbers')).toContainText('None yet.');
});
