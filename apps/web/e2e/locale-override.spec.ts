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

test('логин всегда открывается по-английски, даже если выбран другой язык', async ({ browser }) => {
  // Чистый контекст БЕЗ сессии: под сессией /login законно уводит на /account,
  // где действует запомненный язык — это другой сценарий.
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'locale', value: 'ru', url: 'http://localhost:3000' }]);
  const anon = await ctx.newPage();

  await anon.goto('/login');
  await expect(anon.locator('html')).toHaveAttribute('lang', 'en');
  await expect(anon.getByTestId('login-submit')).toBeVisible();

  // Явный выбор на самом логине по-прежнему работает (переключатель кладёт ?locale=)
  await anon.goto('/login?locale=ru');
  await expect(anon.locator('html')).toHaveAttribute('lang', 'ru');

  // Язык браузера тоже не перебивает английский по умолчанию
  const ctxRu = await browser.newContext({ locale: 'ru-RU' });
  const anonRu = await ctxRu.newPage();
  await anonRu.goto('/login');
  await expect(anonRu.locator('html')).toHaveAttribute('lang', 'en');

  await ctx.close();
  await ctxRu.close();
});
