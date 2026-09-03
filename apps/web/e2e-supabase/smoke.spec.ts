import { expect, test } from '@playwright/test';

/**
 * §11: proves the product path — Supabase Auth, RLS-scoped reads, SQL totals,
 * Realtime — not just the demo repository.
 */
const OWNER = '+919999900001';
const STAFF = '+919999900003';
const OTP = '123456';

async function signIn(page: import('@playwright/test').Page, phone: string) {
  await page.goto('/sign-in');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('/sign-in');
  await page.getByTestId('identifier-input').fill(phone);

  // GoTrue rate-limits OTP resends per number; retry rather than fail the run.
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.getByTestId('send-code').click();
    try {
      await page.getByTestId('otp-input').waitFor({ timeout: 4_000 });
      break;
    } catch {
      await page.waitForTimeout(2_000);
    }
  }

  await page.getByTestId('otp-input').fill(OTP);
  await page.getByTestId('verify-otp').click();
  await expect(page.getByTestId('amount-input')).toBeVisible({ timeout: 30_000 });
}

test('the owner signs in with phone OTP and sees their seeded business', async ({ page }) => {
  await signIn(page, OWNER);
  await expect(page.getByRole('heading', { name: 'Sharma Print Lab' })).toBeVisible();
  await expect(page.getByTestId('entry-row').first()).toBeVisible();
});

test('saving an entry writes through RLS and the SQL totals move', async ({ page }) => {
  await signIn(page, OWNER);
  const before = await page.getByTestId('today-expense-total').textContent();

  await page.getByTestId('amount-input').fill('137');
  await page.getByTestId('note-input').fill('supabase smoke test');
  await page.getByTestId('save-entry').click();

  await expect(page.getByTestId('entry-row').first()).toContainText('supabase smoke test');
  await expect(page.getByTestId('today-expense-total')).not.toHaveText(before ?? '');
});

test('the month view reads the SQL totals views', async ({ page }) => {
  await signIn(page, OWNER);
  await page.getByRole('link', { name: 'Month' }).click();
  await expect(page.getByTestId('category-breakdown')).toBeVisible();
  await expect(page.getByTestId('month-expense')).not.toHaveText('₹0');
});

test('staff see only what RLS allows and cannot export', async ({ page, request }) => {
  await signIn(page, STAFF);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByTestId('export-owner-only')).toBeVisible();
  await expect(page.getByTestId('export-csv')).toHaveCount(0);

  const response = await request.get('/api/export', {
    params: { business_id: 'aaaaaaaa-0000-4000-8000-000000000001', from: '2026-01-01', to: '2026-12-31' },
  });
  expect([401, 403]).toContain(response.status());
});

test('a WhatsApp message posted to the webhook appears without a reload', async ({ page, request }) => {
  await signIn(page, OWNER);
  await expect(page.getByTestId('entry-row').first()).toBeVisible();

  // Letters only: a second number in the message is deliberately ambiguous to
  // the parser, which would refuse to guess an amount (§4.5).
  const marker = `smoke ${Math.random().toString(36).slice(2, 7).replace(/[0-9]/g, 'x')}`;

  // The edge runtime compiles the function on first hit, so a cold container
  // can answer 503 once before it is ready. Retry rather than flake.
  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    const response = await request.post('/api/whatsapp/simulate', {
      data: { from: OWNER, body: `88 ${marker}`, messageId: `wamid.smoke.${Date.now()}.${attempt}` },
    });
    ok = response.ok();
    if (!ok) await page.waitForTimeout(3_000);
  }
  expect(ok, 'the local webhook accepted the message').toBe(true);

  await expect(page.getByTestId('entry-row').first()).toContainText(marker, { timeout: 10_000 });
});
