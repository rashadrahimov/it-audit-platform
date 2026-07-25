import { expect, test } from '@playwright/test';

/**
 * Регрессия T-IR09: список обязан обновляться сразу после server action, без ручного reload.
 *
 * Баг был платформенным: в Next 15.5.x (вшитый React-canary) единственная глобальная
 * Suspense-граница `app/loading.tsx` роняла коммит обновления — сервер отдавал свежий
 * flight-payload, а клиент его не применял. Этот тест ловит возврат симптома на любом
 * экране-списке; если он снова покраснеет — сначала проверить, не вернулся ли
 * корневой loading.tsx (см. запись T-IR09 в docs/backlog.md).
 */
const EMAIL = process.env.E2E_EMAIL ?? 'admin@demo.io';
const PASSWORD = process.env.E2E_PASSWORD ?? 'Demo-Admin-2026';

test('список обновляется сразу после server action (без reload)', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(EMAIL);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await page.waitForURL(/\/account/, { timeout: 15_000 });

  await page.goto('/security-alerts');
  const title = `T-IR09 refresh ${Date.now()}`;
  await page.locator('[data-testid="alert-create"] input[name="title"]').fill(title);
  await page.getByTestId('alert-create-submit').click();

  // Никаких reload: строка обязана появиться сама
  await expect(page.getByTestId('security-alerts-table')).toContainText(title, { timeout: 15_000 });
});
