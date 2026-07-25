import { expect, test } from '@playwright/test';

/**
 * Контракт `apps/web/src/proxy.ts` (T-H110, после Next 16 — конвенция proxy вместо middleware):
 * `?locale=ru|az|en` переопределяет язык на текущий запрос и запоминается cookie.
 * До T-IR10 эта фича не была покрыта ничем: апгрейд Next переносил её вслепую.
 */
const EMAIL = process.env.E2E_EMAIL ?? 'admin@demo.io';
const PASSWORD = process.env.E2E_PASSWORD ?? 'Demo-Admin-2026';

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(EMAIL);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await page.waitForURL(/\/account/, { timeout: 15_000 });
});

test('?locale= переключает язык страницы и запоминается в cookie', async ({ page, context }) => {
  for (const locale of ['ru', 'az', 'en'] as const) {
    await page.goto(`/security-alerts?locale=${locale}`);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const cookie = (await context.cookies()).find((c) => c.name === 'locale');
    expect(cookie?.value, `cookie locale после ?locale=${locale}`).toBe(locale);
  }

  // Запомненная локаль продолжает действовать без параметра в URL
  await page.goto('/security-alerts?locale=ru');
  await page.goto('/incidents');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');

  // Мусорное значение не ломает страницу и не перетирает запомненную локаль
  await page.goto('/incidents?locale=klingon');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
});
