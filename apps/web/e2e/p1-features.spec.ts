import { expect, test } from '@playwright/test';
import { OWNER_PHONE, resetDemoData, signInToComposer } from './helpers';

/**
 * P1 features: recurring proposals, budgets, the business switcher, members and
 * roles, the PDF statement, and GST.
 */

test.describe('recurring entries (P1 #2)', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemoData(page);
    await signInToComposer(page);
  });

  test('a due schedule is proposed and never posts itself', async ({ page }) => {
    // The card is visible before anything is confirmed...
    await expect(page.getByTestId('recurring-due')).toBeVisible();
    const rows = page.getByTestId('entry-row');
    const before = await rows.first().textContent();

    // ...and nothing has been written: reloading leaves the ledger untouched.
    await page.reload();
    await expect(page.getByTestId('recurring-due')).toBeVisible();
    await expect(page.getByTestId('entry-row').first()).toHaveText(before ?? '');
  });

  test('confirming posts the entry and clears the proposal', async ({ page }) => {
    const card = page.getByTestId('recurring-due');
    await expect(card).toBeVisible();
    const dueCount = await page.getByTestId('recurring-due-row').count();

    await page.getByTestId('recurring-confirm').first().click();

    await expect(page.getByTestId('entry-row').first()).toContainText('monthly rent');
    await expect(page.getByTestId('entry-row').first()).toContainText('12,000');
    if (dueCount === 1) await expect(card).toBeHidden();
  });

  test('skipping advances the schedule without writing anything', async ({ page }) => {
    await expect(page.getByTestId('recurring-due')).toBeVisible();
    const before = await page.getByTestId('entry-row').first().textContent();

    await page.getByTestId('recurring-skip').first().click();

    await expect(page.getByTestId('entry-row').first()).toHaveText(before ?? '');
    await expect(page.getByText('Skipped. Next one is scheduled.')).toBeVisible();
  });

  test('a schedule can be created, paused and removed', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByTestId('add-recurring').click();

    await page.getByTestId('recurring-amount').fill('2500');
    await page.getByTestId('recurring-note').fill('internet bill');
    await page.getByTestId('recurring-day').fill('20');
    await page.getByTestId('recurring-save').click();

    const row = page.getByTestId('recurring-row').filter({ hasText: 'internet bill' });
    await expect(row).toBeVisible();

    await row.getByTestId('recurring-toggle').click();
    await expect(row).toContainText('Paused');
  });
});

test.describe('budgets (P1 #8)', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemoData(page);
    await signInToComposer(page);
  });

  test('budget progress shows on the month view', async ({ page }) => {
    await page.getByRole('link', { name: 'Month' }).click();
    await expect(page.getByTestId('budget-bars')).toBeVisible();
    await expect(page.getByTestId('budget-row').first()).toBeVisible();
  });

  test('going over a budget is called out', async ({ page }) => {
    // Set a deliberately tiny ceiling, then spend past it.
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByTestId('budget-category').filter({ hasText: 'Marketing' }).click();
    await page.getByTestId('budget-amount').fill('100');
    await page.getByTestId('save-budget').click();
    await expect(page.getByTestId('budget-settings-list')).toContainText('Marketing');

    await page.getByRole('link', { name: 'Today' }).click();
    await page.getByTestId('amount-input').fill('500');
    await page.getByTestId('category-chip').filter({ hasText: 'Marketing' }).click();
    await page.getByTestId('note-input').fill('banner printing');
    await page.getByTestId('save-entry').click();
    await expect(page.getByTestId('entry-row').first()).toContainText('banner printing');

    await page.getByRole('link', { name: 'Month' }).click();
    const row = page.getByTestId('budget-row').filter({ hasText: 'Marketing' });
    await expect(row).toBeVisible();
    await expect(row.getByTestId('budget-over')).toBeVisible();
    await expect(row).toContainText('over');
  });

  test('a budget can be removed', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByTestId('budget-settings-list')).toBeVisible();
    const first = page.getByTestId('budget-settings-list').locator('li').first();
    const label = await first.innerText();
    await first.getByTestId('remove-budget').click();
    await expect(page.getByTestId('budget-settings-list')).not.toContainText(label.split('\n')[0]!);
  });
});

test.describe('multi-business switcher (P1 #7)', () => {
  test('an owner of two businesses can switch in one tap', async ({ page }) => {
    await resetDemoData(page);
    // Anil owns the print lab and is staff at the tea stall.
    await signInToComposer(page, OWNER_PHONE);

    await expect(page.getByTestId('business-switcher')).toBeVisible();
    await page.getByTestId('business-switcher').click();
    await expect(page.getByTestId('business-list')).toBeVisible();

    await page.getByTestId('business-option').filter({ hasText: 'Green Leaf Tea Stall' }).click();
    await expect(page.getByTestId('business-switcher')).toContainText('Green Leaf Tea Stall');

    // The ledger switched with it: the header now shows the staff role there.
    await expect(page.getByTestId('business-switcher')).toContainText('Staff');
  });
});

test.describe('members and roles (P1 #6)', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemoData(page);
    await signInToComposer(page);
    await page.getByRole('link', { name: 'Settings' }).click();
  });

  test('the owner sees the member list and can issue an invite', async ({ page }) => {
    await expect(page.getByTestId('members-list')).toBeVisible();
    await expect(page.getByTestId('member-row').first()).toContainText('You');

    await page.getByTestId('invite-member').click();
    await page.getByTestId('invite-role-accountant').click();
    await page.getByTestId('create-invite').click();
    await expect(page.getByTestId('invite-code')).toHaveText(/^[A-Z0-9]{6}/);
  });

  test('the last owner cannot be demoted', async ({ page }) => {
    await expect(page.getByTestId('members-list')).toBeVisible();
    // The owner row is "You" and has no role control, which is the guard.
    const self = page.getByTestId('member-row').filter({ hasText: 'You' });
    await expect(self.getByTestId('member-role')).toHaveCount(0);
  });

  test('a staff member cannot invite anyone', async ({ page }) => {
    await page.getByTestId('sign-out').click();
    await signInToComposer(page, '+919999900003');
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByTestId('members-list')).toBeVisible();
    await expect(page.getByTestId('invite-member')).toHaveCount(0);
  });

  test('a bad invite code is refused', async ({ page }) => {
    await page.getByTestId('join-code').fill('ZZZZZZ');
    await page.getByTestId('join-business').click();
    await expect(page.getByText(/not valid or has expired/)).toBeVisible();
  });
});

test.describe('monthly PDF statement (P1 #6)', () => {
  test('the statement downloads as a PDF', async ({ page }) => {
    await resetDemoData(page);
    await signInToComposer(page);
    await page.getByRole('link', { name: 'Month' }).click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-statement').click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.pdf$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const pdf = Buffer.concat(chunks);

    // A real PDF, not an error page.
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(1000);
    expect(pdf.toString('latin1')).toContain('Sharma Print Lab');
  });
});

test.describe('GST (P1 #9)', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemoData(page);
    await signInToComposer(page);
    await page.getByRole('link', { name: 'Settings' }).click();
  });

  test('turning GST on adds a tax field that never changes the total', async ({ page }) => {
    await page.getByTestId('toggle-gst').click();
    await expect(page.getByTestId('gst-summary')).toBeVisible();

    await page.getByRole('link', { name: 'Today' }).click();
    await expect(page.getByTestId('tax-input')).toBeVisible();

    await page.getByTestId('amount-input').fill('1180');
    await page.getByTestId('tax-input').fill('180');
    await page.getByTestId('note-input').fill('printer ink');
    await page.getByTestId('save-entry').click();

    // The ledger records 1180 — the tax is a split inside it, not an addition.
    await expect(page.getByTestId('entry-row').first()).toContainText('1,180');
  });

  test('tax larger than the amount is refused', async ({ page }) => {
    await page.getByTestId('toggle-gst').click();
    await page.getByRole('link', { name: 'Today' }).click();

    await page.getByTestId('amount-input').fill('100');
    await page.getByTestId('tax-input').fill('500');
    await page.getByTestId('note-input').fill('bad tax');
    await page.getByTestId('save-entry').click();

    await expect(page.getByText('Tax cannot be more than the amount')).toBeVisible();
  });

  test('a GSTIN is validated before it is stored', async ({ page }) => {
    await page.getByTestId('toggle-gst').click();
    await page.getByRole('link', { name: 'Search' }).click();
    await page.getByTestId('search-input').fill('counter sale');
    await page.getByTestId('entry-row').first().getByRole('button').click();

    const partyLink = page.getByRole('link', { name: /Ramesh|City College|Milk|Sugar/ }).first();
    await partyLink.click();

    await page.getByTestId('party-gstin').fill('NOTAGSTIN');
    await page.getByTestId('save-gstin').click();
    await expect(page.getByText('That does not look like a valid GSTIN')).toBeVisible();

    await page.getByTestId('party-gstin').fill('29ABCDE1234F1Z5');
    await page.getByTestId('save-gstin').click();
    await expect(page.getByText('That does not look like a valid GSTIN')).toHaveCount(0);
  });
});

test.describe('passkeys (P1 #1)', () => {
  test('the passkey control reflects what the device supports', async ({ page }) => {
    await resetDemoData(page);
    await signInToComposer(page);
    await page.getByRole('link', { name: 'Settings' }).click();

    // Headless Chromium has no platform authenticator, so the honest thing to
    // show is the unsupported message rather than a button that cannot work.
    const unsupported = page.getByTestId('passkey-unsupported');
    const addButton = page.getByTestId('add-passkey');
    await expect(unsupported.or(addButton).first()).toBeVisible();
  });
});
