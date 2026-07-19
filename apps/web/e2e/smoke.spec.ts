import { expect, test } from '@playwright/test';

/**
 * Сквозной smoke (T-H26): логин демо-админом → навигация по ключевым экранам этой сессии
 * (ENG-08 переключатель Активные/Архив, EP-AI /ai-settings). Проверяет весь стек: web SSR +
 * api + сессия/куки + RBAC. Требует поднятых серверов + сида демо.
 */
const EMAIL = process.env.E2E_EMAIL ?? 'admin@demo.io';
const PASSWORD = process.env.E2E_PASSWORD ?? 'Demo-Admin-2026';

test('логин → dashboard → engagements(toggle) → ai-settings → account', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(EMAIL);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();

  // submitLogin редиректит на /account — успешный логин увёл с /login
  await page.waitForURL(/\/account/, { timeout: 15_000 });

  // ENG-08 (T-H25): переключатель Активные/Архив на списке engagement'ов
  await page.goto('/engagements');
  await expect(page.getByTestId('engagements-view-toggle')).toBeVisible();
  await page.goto('/engagements?archived=true');
  await expect(page.getByTestId('engagements-view-toggle')).toBeVisible();

  // EP-AI (T-H23): экран выбора LLM-провайдера
  await page.goto('/ai-settings');
  await expect(page.getByTestId('ai-config-form')).toBeVisible();
  await expect(page.getByTestId('ai-deploy-default')).toBeVisible();

  // хаб аккаунта: ссылка на ai-settings присутствует
  await page.goto('/account');
  await expect(page.getByTestId('go-ai-settings')).toBeVisible();
});

test('защита: без логина protected-экран уводит на /login', async ({ page }) => {
  await page.goto('/ai-settings');
  await page.waitForURL(/\/login/, { timeout: 15_000 });
  await expect(page.getByTestId('login-email')).toBeVisible();
});
