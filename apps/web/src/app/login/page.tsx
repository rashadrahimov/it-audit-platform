import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/session';
import { LocaleSwitcher } from '../locale-switcher';
import { getCurrentLocale } from '@/lib/locale';
import { LoginForm } from './login-form';
import { LogoMark } from '@/components/logo';

export const dynamic = 'force-dynamic';

/** Точки ценности на бренд-панели (SVG Heroicons, не emoji). */
const POINTS = [
  {
    key: 'p1',
    icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    key: 'p2',
    icon: 'M12 3l7 3v5c0 4.25-2.9 7.7-7 8.75C7.9 18.7 5 15.25 5 11V6l7-3z',
  },
  {
    key: 'p3',
    icon: 'M9 17v-6m3 6V7m3 10v-4M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z',
  },
];

export default async function LoginPage() {
  if (await getSessionUser()) redirect('/account');
  const [t, tBrand, locale] = await Promise.all([
    getTranslations('auth'),
    getTranslations('home'),
    getCurrentLocale(),
  ]);

  return (
    <main className="flex min-h-screen">
      {/* Бренд-панель (desktop) */}
      <aside className="relative hidden w-[45%] flex-col justify-between overflow-hidden bg-gradient-to-br from-primary via-[#164e3b] to-[#062c22] p-10 text-on-primary lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-accent/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/5 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
            <LogoMark className="h-6 w-6" />
          </span>
          <span className="flex flex-col">
            <span className="text-lg leading-tight font-bold tracking-[0.1em]">STATERA</span>
            <span className="text-[11px] font-medium tracking-wide text-white/60">
              {tBrand('tagline')}
            </span>
          </span>
        </div>

        <div className="relative flex flex-col gap-7">
          <h2 className="max-w-md text-3xl leading-snug font-bold tracking-tight">
            {t('heroTitle')}
          </h2>
          <ul className="flex flex-col gap-4">
            {POINTS.map((p) => (
              <li key={p.key} className="flex items-center gap-3 text-sm text-white/85">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                  >
                    <path d={p.icon} />
                  </svg>
                </span>
                {t(`points.${p.key}`)}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">© {new Date().getFullYear()} STATERA</p>
      </aside>

      {/* Форма */}
      <section className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
        <div className="flex w-full max-w-sm flex-col gap-6">
          {/* Мобильный бренд */}
          <div className="flex flex-col items-center gap-2 text-center lg:items-start lg:text-left">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-on-primary shadow-sm lg:hidden">
              <LogoMark className="h-6 w-6" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-primary">{t('signIn')}</h1>
            <p className="text-sm text-secondary">{t('subtitle')}</p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6 shadow-md">
            <LoginForm />
          </div>

          <div className="flex justify-center">
            <LocaleSwitcher current={locale} />
          </div>
        </div>
      </section>
    </main>
  );
}
