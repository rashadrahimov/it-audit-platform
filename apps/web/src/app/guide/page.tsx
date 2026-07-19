import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/session';
import { NAV_GROUPS } from '@/lib/nav';

export const dynamic = 'force-dynamic';

/** Гайд по платформе (T-H34): что делает каждый раздел + запуск интерактивного тура. */
export default async function GuidePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tAccount, tHelp] = await Promise.all([
    getTranslations('guide'),
    getTranslations('account'),
    getTranslations('help'),
  ]);

  return (
    <main
      className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6 md:p-10"
      data-testid="guide-page"
    >
      {/* Шапка */}
      <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary to-[#123a5e] p-7 text-on-primary shadow-md md:p-9">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 h-56 w-56 rounded-full bg-accent/25 blur-3xl"
        />
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/75">{t('intro')}</p>
        <Link
          href="/account?tour=1"
          data-testid="guide-start-tour"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
          </svg>
          {t('startTour')}
        </Link>
      </header>

      {/* Разделы по группам */}
      {NAV_GROUPS.map((g) => (
        <section key={g.group} className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-wider text-secondary uppercase">
            {tAccount(`nav.${g.group}`)}
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {g.items.map((it) => {
              const slug = it.href.slice(1);
              const steps = t.raw(`details.${slug}`) as string[];
              return (
                <li
                  key={it.href}
                  className="flex h-full flex-col rounded-xl border border-border bg-surface p-4 shadow-sm transition-all duration-150 hover:border-accent/40 hover:shadow-md"
                >
                  <Link
                    href={it.href}
                    className="group flex flex-col gap-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground group-hover:text-accent">
                        {tAccount(it.label)}
                      </span>
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4 shrink-0 text-border transition-all group-hover:translate-x-0.5 group-hover:text-accent"
                      >
                        <path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </span>
                    <span className="text-xs leading-relaxed text-secondary">
                      {t(`sections.${slug}`)}
                    </span>
                  </Link>
                  {/* Справочник: как пользоваться (T-H35) */}
                  <details className="group/d mt-2 border-t border-border pt-2">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold tracking-wider text-secondary uppercase transition-colors hover:text-accent [&::-webkit-details-marker]:hidden">
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-3 w-3 transition-transform group-open/d:rotate-90"
                      >
                        <path d="M9 5l7 7-7 7" />
                      </svg>
                      {tHelp('howTo')}
                    </summary>
                    <p className="mt-2 text-xs leading-relaxed text-secondary">
                      {t(`long.${slug}`)}
                    </p>
                    <ol className="mt-2 flex flex-col gap-1.5">
                      {steps.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                          <span
                            aria-hidden
                            className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-bold text-accent"
                          >
                            {i + 1}
                          </span>
                          {s}
                        </li>
                      ))}
                    </ol>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
