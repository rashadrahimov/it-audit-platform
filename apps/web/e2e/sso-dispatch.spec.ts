import { expect, test } from '@playwright/test';

/**
 * SSO home-realm discovery (V49, T-H39): рабочий e-mail → маршрут на IdP тенанта
 * (домен demo.io засижен как OIDC) или подсказка войти паролем. Требует api+web+сид.
 */
test('discovery: домен demo.io → предлагает SSO провайдера', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('sso-link').click();
  await page.waitForURL(/\/login\/sso/);
  await page.getByTestId('sso-email').fill('sso-user@demo.io');
  await page.locator('button[type="submit"]').click();
  await expect(page.getByTestId('sso-result-sso')).toBeVisible();
  await expect(page.getByTestId('sso-result-sso')).toContainText('Keycloak (demo)');
});

test('discovery: чужой домен → подсказка войти паролем', async ({ page }) => {
  await page.goto('/login/sso');
  await page.getByTestId('sso-email').fill('nobody@gmail.com');
  await page.locator('button[type="submit"]').click();
  await expect(page.getByTestId('sso-result-password')).toBeVisible();
  await expect(page.getByTestId('sso-to-password')).toBeVisible();
});

/**
 * Полный браузерный round-trip через IdP (T-H40): /login/sso → Continue → Keycloak →
 * веб-сессия на /account. Требует Keycloak (в CI его нет) — гейт E2E_KEYCLOAK=1.
 */
const keycloak = process.env.E2E_KEYCLOAK === '1' ? test : test.skip;
keycloak('SSO round-trip: кнопка доводит вход до /account через Keycloak', async ({ page }) => {
  await page.goto('/login/sso');
  await page.getByTestId('sso-email').fill('sso-user@demo.io');
  await page.locator('button[type="submit"]').click();
  await page.getByTestId('sso-continue').click();
  // страница логина Keycloak
  await page.waitForURL(/realms\/it-audit/, { timeout: 20_000 });
  await page.fill('#username', 'sso-user');
  await page.fill('#password', 'Sso-User-2026');
  await page.click('#kc-login');
  // IdP → API callback (mode=web, cookie) → /account
  await page.waitForURL(/\/account/, { timeout: 20_000 });
  await expect(page.getByTestId('app-sidebar')).toBeVisible();
});
