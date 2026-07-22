import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

/**
 * Функциональный аудит (T-H29): логин → обход ВСЕХ разделов. Для каждого собираем статус,
 * редирект-на-логин (сессия), ошибки консоли, 4xx/5xx-запросы, наличие сайдбара и заголовка.
 * Печатает отчёт в консоль (входит в аудиторский документ). Жёстко падает только на
 * критике: редирект на /login (сломана сессия) или 5xx.
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

interface Finding {
  route: string;
  status: number | null;
  loginRedirect: boolean;
  sidebar: boolean;
  h1: boolean;
  hScroll: boolean;
  consoleErrors: string[];
  httpErrors: string[];
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(EMAIL);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await page.waitForURL(/\/account/, { timeout: 15_000 });
}

test('функциональный аудит всех разделов', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);

  const findings: Finding[] = [];
  for (const route of ROUTES) {
    const consoleErrors: string[] = [];
    const httpErrors: string[] = [];
    const onConsole = (m: ConsoleMessage) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160));
    };
    const onPageError = (e: Error) => consoleErrors.push(`pageerror: ${e.message.slice(0, 160)}`);
    const onResponse = (r: { status: () => number; url: () => string }) => {
      const s = r.status();
      if (s >= 400 && (r.url().includes(':8080') || r.url().startsWith('/')))
        httpErrors.push(`${s} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`);
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);

    let status: number | null = null;
    try {
      const resp = await page.goto(route, { waitUntil: 'networkidle', timeout: 20_000 });
      status = resp?.status() ?? null;
    } catch {
      status = null;
    }
    const url = page.url();
    const loginRedirect = /\/login/.test(url);
    const sidebar = (await page.getByTestId('app-sidebar').count()) > 0;
    const h1 = (await page.locator('h1').count()) > 0;
    const hScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    );

    findings.push({
      route,
      status,
      loginRedirect,
      sidebar,
      h1,
      hScroll,
      consoleErrors,
      httpErrors,
    });
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
  }

  // --- Отчёт ---
  const line = (f: Finding) =>
    `${f.loginRedirect ? '🔒LOGIN' : f.status === 200 ? 'OK ' : `⚠${f.status}`} ` +
    `${f.route.padEnd(20)} sidebar=${f.sidebar ? 'y' : 'N'} h1=${f.h1 ? 'y' : 'N'} ` +
    `hscroll=${f.hScroll ? 'YES' : 'no'} ` +
    `${f.consoleErrors.length ? `errs=${f.consoleErrors.length}` : ''} ` +
    `${f.httpErrors.length ? `http=${f.httpErrors.join('|')}` : ''}`;
  console.log('\n===== AUDIT REPORT =====');
  for (const f of findings) console.log(line(f));
  const withConsole = findings.filter((f) => f.consoleErrors.length);
  if (withConsole.length) {
    console.log('\n--- console errors ---');
    for (const f of withConsole) console.log(`${f.route}: ${f.consoleErrors.join(' || ')}`);
  }
  console.log('========================\n');

  // --- Критические ассёрты ---
  const authBroken = findings.filter((f) => f.loginRedirect).map((f) => f.route);
  const serverErrors = findings.filter((f) => (f.status ?? 0) >= 500).map((f) => f.route);
  const noSidebar = findings.filter((f) => !f.sidebar).map((f) => f.route);
  expect(authBroken, `сессия сломана (редирект на /login): ${authBroken.join(', ')}`).toEqual([]);
  expect(serverErrors, `5xx на: ${serverErrors.join(', ')}`).toEqual([]);
  expect(noSidebar, `нет сайдбара на: ${noSidebar.join(', ')}`).toEqual([]);
});
