import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getLocale } from 'next-intl/server';
import './globals.css';

export const metadata: Metadata = {
  title: 'IT Audit Platform',
  description: 'Multi-tenant платформа IT-аудита для групп компаний',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
