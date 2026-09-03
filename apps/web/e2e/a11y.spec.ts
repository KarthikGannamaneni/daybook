import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { resetDemoData, signInToComposer } from './helpers';

async function scan(page: Page) {
  // Rows fade in over 220 ms; scanning mid-fade measures contrast against a
  // half-blended colour that no user ever reads at rest.
  await page.waitForTimeout(400);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

/** §10.4 scenario 10: zero serious or critical violations on every route. */
test('every route passes an axe scan', async ({ page }) => {
  await resetDemoData(page);

  await page.goto('/sign-in');
  expect(await scan(page), 'sign-in').toEqual([]);

  await signInToComposer(page);
  expect(await scan(page), 'today').toEqual([]);

  await page.getByRole('link', { name: 'Month' }).click();
  await expect(page.getByTestId('category-breakdown')).toBeVisible();
  expect(await scan(page), 'month').toEqual([]);

  await page.getByRole('link', { name: 'Search' }).click();
  await page.getByTestId('search-input').fill('tea');
  await expect(page.getByTestId('entry-list').first()).toBeVisible();
  expect(await scan(page), 'search').toEqual([]);

  await page.goto('/settings');
  await expect(page.getByTestId('export-csv')).toBeVisible();
  expect(await scan(page), 'settings').toEqual([]);
});

test('the entry sheet is accessible', async ({ page }) => {
  await resetDemoData(page);
  await signInToComposer(page);
  await page.getByTestId('entry-row').first().getByRole('button').click();
  await expect(page.getByTestId('delete-entry')).toBeVisible();
  expect(await scan(page), 'entry sheet').toEqual([]);
});

test.describe('reduced motion', () => {
  test('animations are disabled when the system asks for less motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await resetDemoData(page);
    await signInToComposer(page);

    const durations = await page.evaluate(() => {
      const chip = document.querySelector('.chip');
      const button = document.querySelector('[data-testid="save-entry"]');
      return [chip, button]
        .filter(Boolean)
        .map((el) => getComputedStyle(el as Element).transitionDuration);
    });

    expect(durations.length).toBeGreaterThan(0);
    for (const duration of durations) expect(Number.parseFloat(duration)).toBeLessThan(0.01);
  });
});
