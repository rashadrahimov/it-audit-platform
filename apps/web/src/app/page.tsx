import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { fetchApiHealth } from '@/lib/api';
import { getCurrentLocale } from '@/lib/locale';
import { getSessionUser } from '@/lib/session';
import { LocaleSwitcher } from './locale-switcher';
import { LogoMark } from '@/components/logo';

export const dynamic = 'force-dynamic';

const FEATURES = [
  {
    t: 'f1t',
    d: 'f1d',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.6L19 8.4V19a2 2 0 01-2 2z',
  },
  {
    t: 'f2t',
    d: 'f2d',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    t: 'f3t',
    d: 'f3d',
    icon: 'M9 17v-6m3 6V7m3 10v-4M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z',
  },
];

/** Лендинг (T-005 → T-H33): navy-hero в стиле бренд-панели логина. Авторизованных — в приложение. */
export default async function HomePage() {
  if (await getSessionUser()) redirect('/account');
  const [health, t, locale] = await Promise.all([
    fetchApiHealth(),
    getTranslations('home'),
    getCurrentLocale(),
  ]);

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-primary via-[#164e3b] to-[#062c22] text-on-primary">
      {/* мягкие свечения */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-24 h-[28rem] w-[28rem] rounded-full bg-accent/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-white/5 blur-3xl"
      />

      {/* верхняя панель */}
      <header className="relative flex items-center justify-between gap-4 px-6 py-5 md:px-10">
        <span className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
            <LogoMark className="h-5 w-5" />
          </span>
          <span className="flex flex-col">
            <span className="text-base leading-tight font-bold tracking-[0.1em]">{t('title')}</span>
            <span className="text-[10px] font-medium tracking-wide text-white/55">
              {t('tagline')}
            </span>
          </span>
        </span>
        <span className="[&_a]:text-white/70 [&_a:hover]:text-white">
          <LocaleSwitcher current={locale} ariaLabel={t('language')} />
        </span>
      </header>

      {/* герой */}
      <section className="relative flex flex-1 flex-col items-center justify-center gap-8 px-6 py-14 text-center">
        <h1 className="max-w-3xl text-4xl leading-tight font-bold tracking-tight md:text-5xl">
          {t('heroTitle')}
        </h1>
        <p className="max-w-xl text-base text-white/75 md:text-lg">{t('heroSub')}</p>

        <div className="flex flex-col items-center gap-4">
          <Link
            href="/login"
            data-testid="go-login"
            className="rounded-xl bg-accent px-8 py-3.5 text-base font-semibold text-on-primary shadow-lg transition-all duration-150 hover:-translate-y-0.5 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary focus-visible:outline-none"
          >
            {t('signIn')}
          </Link>
          <p
            data-testid="api-status"
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white/70 backdrop-blur"
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${health ? 'bg-success' : 'bg-destructive'}`}
            />
            {health ? t('apiOk', health) : t('apiDown')}
          </p>
        </div>

        {/* фичи */}
        <ul className="mt-6 grid w-full max-w-4xl grid-cols-1 gap-4 text-left sm:grid-cols-3">
          {FEATURES.map((f) => (
            <li
              key={f.t}
              className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur transition-colors duration-150 hover:bg-white/10"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d={f.icon} />
                </svg>
              </span>
              <span className="text-sm font-semibold">{t(f.t)}</span>
              <span className="text-xs leading-relaxed text-white/65">{t(f.d)}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="relative px-6 py-5 text-center text-xs text-white/40">
        © {new Date().getFullYear()} {t('title')} — {t('tagline')}
      </footer>
    </main>
  );
}
