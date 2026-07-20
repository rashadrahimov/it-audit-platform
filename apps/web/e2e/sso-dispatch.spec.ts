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
