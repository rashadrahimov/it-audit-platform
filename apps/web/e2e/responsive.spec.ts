import { expect, test, type Page } from '@playwright/test';

/**
 * T-H143: repo-side a11y/responsive guard. This is not a WCAG certification; it catches
 * regressions we can prove in CI: tablet/mobile horizontal overflow, mobile drawer access,
 * headings, and basic keyboard focus reachability.
 */
const EMAIL = process.env.E2E_EMAIL ?? 'admin@demo.io';
const PASSWORD = process.env.E2E_PASSWORD ?? 'Demo-Admin-2026';

const ROUTES = [
  '/account',
  '/dashboard',
  '/dashboards',
  '/reports',
  '/action-plans',
  '/snapshots',
  '/trends',
  '/kpi',
  '/frameworks',
  '/controls',
  '/policies',
  '/commitments',
  '/universe',
  '/engagements',
  '/audit-programs',
  '/working-papers',
  '/plans',
  '/allocations',
  '/time',
  '/satisfaction',
  '/risks',
  '/risk-heatmap',
  '/privacy',
  '/iam',
  '/access-reviews',
  '/devices',
  '/security-alerts',
  '/vulnerabilities',
  '/code-changes',
  '/vendors',
  '/trust-center',
  '/questionnaires',
  '/knowledge-base',
  '/personnel',
  '/connectors',
  '/config',
  '/field-permissions',
  '/auditors',
  '/auditor-view',
  '/api-keys',
  '/notifications',
  '/migration',
  '/ai-settings',
  '/glossary',
  '/guide',
];

const MOBILE_ROUTES = [
  '/account',
  '/engagements',
  '/action-plans',
  '/risks',
  '/documents',
  '/config',
  '/guide',
];

async function login(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(EMAIL);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await page.waitForURL(/\/account/, { timeout: 15_000 });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  );
  expect(overflow, `horizontal overflow on ${page.url()}`).toBe(false);
}

test('tablet viewport: all sections keep headings and avoid horizontal overflow', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 768, height: 1024 });
  await login(page);

  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: 'networkidle' });
    await expect(page.locator('h1').first(), `h1 on ${route}`).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test('mobile viewport: drawer opens and key screens avoid horizontal overflow', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  await expect(page.getByTestId('mobile-menu')).toBeVisible();
  await page.getByTestId('mobile-menu').click();
  await expect(page.getByTestId('app-sidebar')).toBeVisible();
  await page.getByTestId('nav-group-engagements').click();
  await expect(page.getByTestId('go-engagements')).toBeVisible();

  for (const route of MOBILE_ROUTES) {
    await page.goto(route, { waitUntil: 'networkidle' });
    await expect(page.locator('h1').first(), `h1 on ${route}`).toBeVisible();
    await expect(page.getByTestId('mobile-menu'), `mobile menu on ${route}`).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test('keyboard focus reaches visible interactive controls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);
  await page.keyboard.press('Tab');

  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const rect = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      visible: rect.width > 0 && rect.height > 0,
      inViewport:
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth,
    };
  });

  expect(focused?.visible).toBe(true);
  expect(focused?.inViewport).toBe(true);
});
