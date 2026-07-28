import { defineConfig } from '@playwright/test';

/**
 * E2E smoke-набор (T-H26): сквозная проверка логин→навигация по ключевым экранам.
 * Требует поднятых api (:3001) + web (:3000) + сида демо (см. verify SKILL). Запуск:
 *   pnpm --filter @it-audit/web test:e2e
 * Юнит-прогон (vitest include src/**) e2e/ не подхватывает.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // Один воркер: все спеки ходят в ОДИН api + demo-тенант, параллельные воркеры мешают
  // друг другу данными (счётчики, созданные записи) и дают плавающие падения под нагрузкой.
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    headless: true,
    // Позволяет указать заранее установленный chromium (напр. в managed-окружении,
    // где нет пиннутого playwright-браузера). Не задан → стандартное поведение.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
});
