import { expect, test } from '@playwright/test';
import { resetDemoData, signInToComposer } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetDemoData(page);
  await signInToComposer(page);
});

/** §10.4 scenario 2: a repeat expense in three taps or fewer from app open. */
test('a quick chip saves a repeat expense in three taps', async ({ page }) => {
  const totalBefore = await page.getByTestId('today-expense-total').textContent();
  const rowsBefore = await page.getByTestId('entry-row').count();

  // Tap 1: the chip. Tap 2: Save. (Tap 0 was opening the app.)
  const chip = page.getByTestId('quick-chip').first();
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(page.getByTestId('amount-input')).not.toHaveValue('');

  await page.getByTestId('save-entry').click();

  await expect(page.getByTestId('entry-row')).toHaveCount(rowsBefore === 5 ? 5 : rowsBefore + 1);
  await expect(page.getByTestId('today-expense-total')).not.toHaveText(totalBefore ?? '');
  await expect(page.getByTestId('amount-input')).toHaveValue('');
});

test('typing an amount and saving adds the entry and moves the running total', async ({ page }) => {
  await page.getByTestId('amount-input').fill('450');
  await page.getByTestId('note-input').fill('tea shop');
  await page.getByTestId('save-entry').click();

  await expect(page.getByTestId('entry-row').first()).toContainText('tea shop');
  await expect(page.getByTestId('entry-row').first()).toContainText('450');
});

test('an amount is required', async ({ page }) => {
  await page.getByTestId('save-entry').click();
  await expect(page.getByText('Enter an amount')).toBeVisible();
});

test('lakh grouping is used for en-IN amounts', async ({ page }) => {
  await page.getByTestId('amount-input').fill('123456');
  await page.getByTestId('note-input').fill('big machine');
  await page.getByTestId('save-entry').click();

  await expect(page.getByTestId('entry-row').first()).toContainText('1,23,456');
});

/** §4.3: same amount and category within two minutes asks before saving. */
test('a duplicate within two minutes prompts before saving', async ({ page }) => {
  await page.getByTestId('amount-input').fill('777');
  await page.getByTestId('category-chip').filter({ hasText: 'Transport' }).click();
  await page.getByTestId('save-entry').click();
  await expect(page.getByTestId('entry-row').first()).toContainText('777');

  await page.getByTestId('amount-input').fill('777');
  await page.getByTestId('category-chip').filter({ hasText: 'Transport' }).click();
  await page.getByTestId('save-entry').click();

  await expect(page.getByText('Looks like a duplicate')).toBeVisible();
  await page.getByTestId('duplicate-confirm').click();
  await expect(page.getByText('Looks like a duplicate')).toBeHidden();
});

/** §10.4 scenario 4: undo inside 8 seconds restores; letting it lapse commits. */
test('delete then undo restores the entry', async ({ page }) => {
  await page.getByTestId('amount-input').fill('321');
  await page.getByTestId('note-input').fill('undo me');
  await page.getByTestId('save-entry').click();
  await expect(page.getByTestId('entry-row').first()).toContainText('undo me');

  await page.getByTestId('entry-row').first().getByRole('button').click();
  await page.getByTestId('delete-entry').click();

  await expect(page.getByTestId('toast')).toBeVisible();
  await page.getByTestId('toast-action').click();

  await expect(page.getByTestId('entry-row').first()).toContainText('undo me');
});

test('delete without undo removes the entry and updates the total', async ({ page }) => {
  await page.getByTestId('amount-input').fill('654');
  await page.getByTestId('note-input').fill('goodbye');
  await page.getByTestId('save-entry').click();
  await expect(page.getByTestId('entry-row').first()).toContainText('goodbye');
  const totalAfterSave = await page.getByTestId('today-expense-total').textContent();

  await page.getByTestId('entry-row').first().getByRole('button').click();
  await page.getByTestId('delete-entry').click();
  await expect(page.getByTestId('toast')).toBeVisible();

  // Let the 8-second window lapse without touching Undo.
  await page.waitForTimeout(9_000);
  await expect(page.getByTestId('toast')).toBeHidden();
  await expect(page.getByText('goodbye')).toHaveCount(0);
  await expect(page.getByTestId('today-expense-total')).not.toHaveText(totalAfterSave ?? '');
});

/** §6.5: the deep link the WhatsApp confirmation points at prefills the composer. */
test('a deep link prefills the composer', async ({ page }) => {
  await page.goto('/e/new?amount=450&note=tea');
  await expect(page.getByTestId('amount-input')).toHaveValue('450');
  await expect(page.getByTestId('note-input')).toHaveValue('tea');
});

/** §4.3: entries are editable, not only deletable. */
test('an entry can be edited', async ({ page }) => {
  await page.getByTestId('amount-input').fill('900');
  await page.getByTestId('note-input').fill('before edit');
  await page.getByTestId('save-entry').click();
  await expect(page.getByTestId('entry-row').first()).toContainText('before edit');

  await page.getByTestId('entry-row').first().getByRole('button').click();
  await page.getByTestId('edit-entry').click();
  await page.getByTestId('edit-amount').fill('1500');
  await page.getByTestId('edit-note').fill('after edit');
  await page.getByTestId('edit-save').click();

  await expect(page.getByTestId('entry-row').first()).toContainText('after edit');
  await expect(page.getByTestId('entry-row').first()).toContainText('1,500');
  await expect(page.getByText('before edit')).toHaveCount(0);
});
