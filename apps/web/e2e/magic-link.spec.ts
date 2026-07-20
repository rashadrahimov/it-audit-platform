import { expect, test } from '@playwright/test';

/**
 * Passwordless magic-link (T-H38): UI-тумблер + сквозной callback через реальное
 * письмо в Mailpit. Требует поднятых api(:3001)+web(:3000)+Mailpit(:8025) и сида демо.
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:3001';
const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
const EMAIL = process.env.E2E_EMAIL ?? 'admin@demo.io';

test('passwordless UI: тумблер → форма → «проверьте почту»', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('magic-toggle').click();
  await expect(page.getByTestId('magic-form')).toBeVisible();
  await page.getByTestId('magic-email').fill(EMAIL);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByTestId('magic-sent')).toBeVisible();
});

test('passwordless callback: ссылка из письма логинит в /account', async ({ page, request }) => {
  await request.delete(`${MAILPIT}/api/v1/messages`);
  const req = await request.post(`${API}/auth/magic-link/request`, { data: { email: EMAIL } });
  expect(req.status()).toBe(202);

  // достать одноразовый токен из письма (poll Mailpit)
  let token = '';
  for (let i = 0; i < 20 && !token; i++) {
    const list = await (await request.get(`${MAILPIT}/api/v1/messages`)).json();
    if (list.messages?.length) {
      const msg = await (
        await request.get(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)
      ).json();
      token = `${msg.Text ?? ''}${msg.HTML ?? ''}`.match(/token=([A-Za-z0-9_-]+)/)?.[1] ?? '';
    }
    if (!token) await page.waitForTimeout(500);
  }
  expect(token).not.toBe('');

  await page.goto(`/login/magic?token=${token}`);
  await page.waitForURL(/\/account/, { timeout: 15_000 });
  await expect(page.getByTestId('app-sidebar')).toBeVisible();
});
