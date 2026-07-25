import { expect, test } from '@playwright/test';

/**
 * DoD T-IR06 (EP-INC): полный цикл инцидента проходится из браузера — заведение,
 * фазы реагирования, заметка в таймлайн, постмортем. Нужны поднятые api+web и `pnpm seed`.
 *
 * ⚠ После server action собранный `next start` не перерисовывает текущий маршрут до reload —
 * поведение общее для всех списков платформы (воспроизводится и на существующем
 * /security-alerts, см. запись в бэклоге T-IR06), поэтому шаги делают `page.reload()`.
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

test('инцидент проходит цикл из браузера: заведение → фазы → таймлайн → постмортем', async ({
  page,
}) => {
  const title = `E2E утечка ${Date.now()}`;

  await page.goto('/incidents');
  await expect(page.getByTestId('incident-create')).toBeVisible();

  // 1. Заведение — новый инцидент появляется в реестре, оттуда открываем карточку
  await page.locator('[data-testid="incident-create"] input[name="title"]').fill(title);
  await page
    .locator('[data-testid="incident-create"] select[name="severity"]')
    .selectOption('high');
  await page.getByTestId('incident-create-submit').click();
  await page.waitForTimeout(1000);
  await page.reload();
  await expect(page.getByTestId('incidents-table')).toContainText(title, { timeout: 15_000 });
  // ссылка строки ведёт на карточку — идём по её href (клиентская навигация в собранном
  // билде догоняется не всегда, а проверяем мы содержимое карточки, а не роутер)
  const href = await page.getByRole('link', { name: title }).getAttribute('href');
  expect(href).toMatch(/\/incidents\/[0-9a-f-]+$/);
  await page.goto(href!);
  await expect(page.getByTestId('incident-title')).toContainText(title);

  // 2. Фазы реагирования: ведём до recovered, каждый переход виден в таймлайне
  const phases = [
    /Triaged|Триаж/,
    /Contained|Локализован/,
    /Eradicated|Устранён/,
    /Recovered|Восстановлено/,
  ];
  for (const phase of phases) {
    await page.getByTestId('incident-transition').locator('button[type=submit]').click();
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.getByTestId('incident-timeline')).toContainText(phase, { timeout: 15_000 });
  }

  // 3. Ручная запись в таймлайн
  const timeline = page.getByTestId('incident-timeline');
  await timeline.locator('input[name="note"]').fill('e2e: собраны логи');
  await timeline.locator('button[type=submit]').click();
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByTestId('incident-timeline')).toContainText('e2e: собраны логи', {
    timeout: 15_000,
  });

  // 4. Постмортем открылся на фазе recovered и сохраняется
  const pm = page.getByTestId('incident-postmortem');
  await pm.locator('textarea[name="rootCause"]').fill('e2e: ключ в репозитории');
  await pm.locator('button[type=submit]').click();
  await page.waitForTimeout(800);
  await page.reload();
  await expect(
    page.getByTestId('incident-postmortem').locator('textarea[name="rootCause"]'),
  ).toHaveValue('e2e: ключ в репозитории', { timeout: 15_000 });

  // 5. Инцидент виден в реестре
  await page.goto('/incidents');
  await expect(page.getByTestId('incidents-table')).toContainText(title);
});
