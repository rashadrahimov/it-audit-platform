import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/app-shell';
import {
  apiFetch,
  getActiveTenantCategory,
  getActiveTenantSlug,
  getSessionUser,
} from '@/lib/session';
import { navForCategory } from '@/lib/nav';
import './globals.css';

// self-hosted при build (next/font) — в рантайме внешних запросов нет (on-prem, ADR-0002)
const font = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'STATERA — IT Audit & GRC Platform',
  description: 'STATERA: multi-tenant платформа IT-аудита и GRC для групп компаний',
};

/** App-shell (T-H28): авторизованные страницы получают постоянный сайдбар; /login — без. */
async function Shell({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) return <>{children}</>;
  const [t, tTour, tGuide, tHelp, tenantSlug, category] = await Promise.all([
    getTranslations('account'),
    getTranslations('tour'),
    getTranslations('guide'),
    getTranslations('help'),
    getActiveTenantSlug(),
    getActiveTenantCategory(),
  ]);
  // T-V50: внешний аудитор (category=auditor) получает scoped-навигацию
  const navGroups = navForCategory(category);
  // T-V36c: per-tenant idle timeout для авто-логаута в app-shell
  let idleTimeoutMin = 0;
  if (tenantSlug) {
    const bizRes = await apiFetch('/business-profile', {
      headers: { 'X-Tenant-Slug': tenantSlug },
    });
    if (bizRes.ok) idleTimeoutMin = Number((await bizRes.json()).idleTimeoutMin) || 0;
  }
  const groups = navGroups.map((g) => ({
    group: g.group,
    label: t(`nav.${g.group}`),
    items: g.items.map((it) => ({ ...it, label: t(it.label) })),
  }));

  // Шаги интерактивного тура (T-H34): сайдбар → 7 групп → крошки → профиль
  const tourSteps = [
    { selector: '[data-testid="app-sidebar"]', key: 'sidebar' },
    ...navGroups.map((g) => ({
      selector: `[data-testid="nav-group-${g.group}"]`,
      key: g.group === 'thirdParty' ? 'thirdParty' : g.group,
    })),
    { selector: '[data-testid="topbar-breadcrumbs"]', key: 'breadcrumbs' },
    { selector: '[data-testid="logout"]', key: 'profile' },
  ].map(({ selector, key }) => ({
    selector,
    title: tTour(`steps.${key}.t`),
    text: tTour(`steps.${key}.d`),
  }));

  // Контекстный справочник (T-H35): slug → {title, summary, steps} по каждому разделу
  const helpEntries: Record<
    string,
    { title: string; summary: string; detail: string; steps: string[] }
  > = {
    account: {
      title: t('home'),
      summary: tGuide('sections.account'),
      detail: tGuide('long.account'),
      steps: tGuide.raw('details.account') as string[],
    },
  };
  for (const g of navGroups) {
    for (const it of g.items) {
      const slug = it.href.slice(1);
      helpEntries[slug] = {
        title: t(it.label),
        summary: tGuide(`sections.${slug}`),
        detail: tGuide(`long.${slug}`),
        steps: tGuide.raw(`details.${slug}`) as string[],
      };
    }
  }

  return (
    <AppShell
      groups={groups}
      user={{ name: user.fullName, email: user.email }}
      labels={{
        brand: 'STATERA',
        brandSub: tenantSlug ?? 'GRC',
        signOut: t('signOut'),
        menu: t('menu'),
        home: t('home'),
        searchPh: t('searchPh'),
      }}
      tour={{
        steps: tourSteps,
        labels: {
          offerTitle: tTour('offerTitle'),
          offerText: tTour('offerText'),
          start: tTour('start'),
          later: tTour('later'),
          next: tTour('next'),
          back: tTour('back'),
          skip: tTour('skip'),
          done: tTour('done'),
          stepOf: tTour('stepOf', { i: '{i}', n: '{n}' }),
          openGuide: tTour('openGuide'),
          hideAsk: tTour('hideAsk'),
          hideYes: tTour('hideYes'),
          hideNo: tTour('hideNo'),
        },
      }}
      help={{
        entries: helpEntries,
        labels: {
          title: tHelp('title'),
          howTo: tHelp('howTo'),
          current: tHelp('current'),
          startTour: tHelp('startTour'),
          openGuide: tHelp('openGuide'),
          close: tHelp('close'),
        },
      }}
      idleTimeoutMin={idleTimeoutMin}
    >
      {children}
    </AppShell>
  );
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <html lang={locale} className={font.variable}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <NextIntlClientProvider messages={messages}>
          <Shell>{children}</Shell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
