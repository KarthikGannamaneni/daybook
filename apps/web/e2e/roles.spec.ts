import { expect, test } from '@playwright/test';
import { OWNER_PHONE, STAFF_PHONE, resetDemoData, signInToComposer } from './helpers';

/**
 * §10.4 scenario 8: a staff member cannot reach the owner-only export, and the
 * route refuses rather than leaking anything.
 */
test('staff cannot export and the export route refuses', async ({ page, request }) => {
  await resetDemoData(page);
  await signInToComposer(page, STAFF_PHONE);
  await page.getByRole('link', { name: 'Settings' }).click();

  await expect(page.getByTestId('export-owner-only')).toBeVisible();
  await expect(page.getByTestId('export-csv')).toHaveCount(0);
  await expect(page.getByTestId('generate-link-code')).toHaveCount(0);

  const response = await request.get('/api/export', {
    params: {
      business_id: '00000000-0000-4000-8000-000000000001',
      from: '2026-01-01',
      to: '2026-12-31',
    },
  });
  expect(response.status()).toBe(403);
  const body = await response.text();
  expect(body).not.toContain('amount');
  expect(body).not.toContain('tea');
});

/** §3: staff may not delete entries they did not create. */
test('staff cannot delete an entry created by the owner', async ({ page }) => {
  await resetDemoData(page);

  // The owner records something the staff member did not create.
  await signInToComposer(page, OWNER_PHONE);
  await page.getByTestId('amount-input').fill('4321');
  await page.getByTestId('note-input').fill('owner only entry');
  await page.getByTestId('save-entry').click();
  await expect(page.getByTestId('entry-row').first()).toContainText('owner only entry');
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByTestId('sign-out').click();

  await signInToComposer(page, STAFF_PHONE);
  const row = page.getByTestId('entry-row').filter({ hasText: 'owner only entry' }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button').click();
  await page.getByTestId('delete-entry').click();

  await expect(page.getByRole('alert')).toContainText('own entries');
  await page.keyboard.press('Escape');
  await expect(page.getByText('owner only entry').first()).toBeVisible();
});

test('the owner sees the export control', async ({ page }) => {
  await resetDemoData(page);
  await signInToComposer(page, OWNER_PHONE);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByTestId('export-csv')).toBeVisible();
});

/** §4.6: the CSV downloads and carries both machine and display amounts. */
test('the owner can download a CSV export', async ({ page }) => {
  await resetDemoData(page);
  await signInToComposer(page, OWNER_PHONE);
  await page.getByRole('link', { name: 'Settings' }).click();

  // §4.1: exporting re-verifies the person before it runs.
  await page.getByTestId('export-csv').click();
  await page.getByTestId('reauth-input').fill('123456');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('reauth-confirm').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^khata-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const csv = Buffer.concat(chunks).toString('utf8');

  expect(csv.startsWith('﻿')).toBe(true);
  expect(csv).toContain('date_iso,date_local,type,amount,amount_display');
  expect(csv.split('\r\n').length).toBeGreaterThan(5);
});
