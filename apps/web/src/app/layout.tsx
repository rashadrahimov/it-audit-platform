import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/app-shell';
import { getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { NAV_GROUPS } from '@/lib/nav';
import './globals.css';

// self-hosted при build (next/font) — в рантайме внешних запросов нет (on-prem, ADR-0002)
const font = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'IT Audit Platform',
  description: 'Multi-tenant платформа IT-аудита для групп компаний',
};

/** App-shell (T-H28): авторизованные страницы получают постоянный сайдбар; /login — без. */
async function Shell({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) return <>{children}</>;
  const [t, tenantSlug] = await Promise.all([getTranslations('account'), getActiveTenantSlug()]);
  const groups = NAV_GROUPS.map((g) => ({
    group: g.group,
    label: t(`nav.${g.group}`),
    items: g.items.map((it) => ({ ...it, label: t(it.label) })),
  }));
  return (
    <AppShell
      groups={groups}
      user={{ name: user.fullName, email: user.email }}
      labels={{
        brand: 'IT Audit',
        brandSub: tenantSlug ?? 'GRC',
        signOut: t('signOut'),
        menu: t('menu'),
        home: t('home'),
      }}
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
