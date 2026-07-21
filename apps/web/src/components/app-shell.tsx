'use client';

import { type ReactNode, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/app/login/actions';
import { ProductTour, type TourLabels, type TourStep } from '@/components/product-tour';
import { HelpPanel, type HelpEntry, type HelpLabels } from '@/components/help-panel';
import { LogoMark } from '@/components/logo';

interface NavItem {
  href: string;
  testid: string;
  label: string;
}
interface NavGroup {
  group: string;
  label: string;
  items: NavItem[];
}
interface Labels {
  brand: string;
  brandSub: string;
  signOut: string;
  menu: string;
  home: string;
  searchPh: string;
}

/** Иконки групп (Heroicons outline, 18px). SVG, не emoji — по чеклисту ui-ux-pro-max. */
const ICONS: Record<string, ReactNode> = {
  overview: (
    <path d="M3.75 6A2.25 2.25 0 016 3.75h1.5A2.25 2.25 0 019.75 6v1.5A2.25 2.25 0 017.5 9.75H6A2.25 2.25 0 013.75 7.5V6zm10.5 0A2.25 2.25 0 0116.5 3.75H18A2.25 2.25 0 0120.25 6v1.5A2.25 2.25 0 0118 9.75h-1.5a2.25 2.25 0 01-2.25-2.25V6zM3.75 16.5a2.25 2.25 0 012.25-2.25h1.5a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-1.5zm10.5 0a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-1.5A2.25 2.25 0 0114.25 18v-1.5z" />
  ),
  compliance: (
    <path d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
  ),
  engagements: (
    <path d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
  ),
  risk: (
    <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
  ),
  security: (
    <path d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
  ),
  thirdParty: (
    <path d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
  ),
  org: (
    <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
  ),
};

function GroupIcon({ group }: { group: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px] shrink-0"
    >
      {ICONS[group] ?? ICONS.overview}
    </svg>
  );
}

/** Постоянная левая навигация (Vanta-подобный app-shell, T-H28). Desktop — статичный
 *  сайдбар; mobile — выезжающий drawer. Активный пункт подсвечен, группы с иконками. */
export function AppShell({
  groups,
  user,
  labels,
  tour,
  help,
  idleTimeoutMin = 0,
  children,
}: {
  groups: NavGroup[];
  user: { name: string; email: string };
  labels: Labels;
  tour: { steps: TourStep[]; labels: TourLabels };
  help: { entries: Record<string, HelpEntry>; labels: HelpLabels };
  idleTimeoutMin?: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // T-V36c: авто-логаут при простое (per-tenant idleTimeoutMin, 0 = выкл)
  useEffect(() => {
    if (!idleTimeoutMin || idleTimeoutMin <= 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void logoutAction(), idleTimeoutMin * 60_000);
    };
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [idleTimeoutMin]);
  const [tourSignal, setTourSignal] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  // справочник: запись по текущему разделу (первый сегмент пути; '' → account)
  const helpSlug = pathname.split('/')[1] || 'account';
  const helpEntry = help.entries[helpSlug] ?? help.entries.account!;
  const initials =
    user.name
      .split(' ')
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'U';

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  // Хлебные крошки: активный пункт навигации → «Группа / Раздел» (на /account — только Home)
  const crumb = groups
    .flatMap((g) => g.items.map((it) => ({ g, it })))
    .find(({ it }) => isActive(it.href));
  const crumbItem = crumb?.it.label;
  // не дублировать, когда имя группы совпадает с именем раздела («Engagements / Engagements»)
  const crumbGroup = crumb && crumb.g.label !== crumb.it.label ? crumb.g.label : undefined;

  // Сворачиваемые группы (аккордеон): по умолчанию открыта только активная (или первая).
  const activeGroup = groups.find((g) => g.items.some((it) => isActive(it.href)))?.group;
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(activeGroup ? [activeGroup] : groups[0] ? [groups[0].group] : []),
  );
  useEffect(() => {
    if (activeGroup) setOpenGroups((p) => (p.has(activeGroup) ? p : new Set(p).add(activeGroup)));
  }, [activeGroup]);
  const toggleGroup = (g: string) =>
    setOpenGroups((p) => {
      const n = new Set(p);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      {groups.map((g) => {
        const groupOpen = openGroups.has(g.group);
        const groupActive = g.items.some((it) => isActive(it.href));
        return (
          <div key={g.group} className="mb-1.5">
            <button
              type="button"
              onClick={() => toggleGroup(g.group)}
              aria-expanded={groupOpen}
              data-testid={`nav-group-${g.group}`}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                groupActive ? 'text-white' : 'text-white/55 hover:bg-white/8 hover:text-white/85'
              }`}
            >
              <GroupIcon group={g.group} />
              <span className="flex-1 text-left text-[11px] font-semibold tracking-wider uppercase">
                {g.label}
              </span>
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
                  groupOpen ? 'rotate-180' : ''
                }`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {groupOpen && (
              <ul className="mt-0.5 mb-2 flex flex-col gap-0.5">
                {g.items.map((it) => {
                  const active = isActive(it.href);
                  return (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        data-testid={it.testid}
                        onClick={() => setOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={`group relative flex items-center gap-2.5 rounded-lg py-1.5 pr-2 pl-3.5 text-sm transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                          active
                            ? 'bg-white/12 font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-emerald-300'
                            : 'text-white/60 hover:bg-white/7 hover:text-white'
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                            active
                              ? 'bg-emerald-300 shadow-[0_0_8px_rgb(110_231_183/0.6)]'
                              : 'bg-white/20 group-hover:bg-white/55'
                          }`}
                        />
                        <span className="truncate">{it.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );

  const brand = (
    <Link
      href="/account"
      onClick={() => setOpen(false)}
      className="flex items-center gap-2.5 border-b border-white/10 px-4 py-5 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-300 to-emerald-500 text-primary shadow-[0_8px_22px_rgb(16_185_129/0.28)] ring-1 ring-white/20">
        <LogoMark className="h-5 w-5" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-bold tracking-[0.12em] text-white">
          {labels.brand}
        </span>
        <span className="truncate text-xs text-white/45">{labels.brandSub}</span>
      </span>
    </Link>
  );

  const footer = (
    <div className="flex items-center gap-3 border-t border-white/10 px-3 py-3.5">
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-emerald-200 ring-1 ring-white/10"
      >
        {initials}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span data-testid="account-name" className="truncate text-sm font-medium text-white/90">
          {user.name}
        </span>
        <span data-testid="account-email" className="truncate text-xs text-white/40">
          {user.email}
        </span>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          data-testid="logout"
          title={labels.signOut}
          aria-label={labels.signOut}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-white/45 hover:bg-white/10 hover:text-rose-300 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[18px] w-[18px]"
          >
            <path d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
        </button>
      </form>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Backdrop (только mobile, когда drawer открыт) */}
      {open && (
        <button
          aria-label="close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-foreground/40 md:hidden"
        />
      )}

      {/* Единый адаптивный сайдбар: desktop — статичный (sticky), mobile — drawer */}
      <aside
        data-testid="app-sidebar"
        className={`fixed top-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col border-r border-white/8 bg-[linear-gradient(165deg,#123c2e_0%,#0b2a21_58%,#071e18_100%)] shadow-[10px_0_40px_rgb(18_55_42/0.1)] transition-transform duration-200 md:sticky md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {brand}
        {nav}
        {footer}
      </aside>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Единый топ-бар: mobile — гамбургер+бренд; desktop — хлебные крошки */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/60 bg-surface/75 px-4 py-3 shadow-[0_1px_0_rgb(18_55_42/0.03)] backdrop-blur-xl md:px-8">
          <button
            type="button"
            aria-label={labels.menu}
            onClick={() => setOpen(true)}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border text-secondary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              className="h-5 w-5"
            >
              <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>
          <span className="text-sm font-bold tracking-[0.08em] text-foreground md:hidden">
            {labels.brand}
          </span>

          {/* Хлебные крошки (desktop) */}
          <nav
            aria-label="Breadcrumb"
            className="hidden min-w-0 items-center gap-1.5 text-sm md:flex"
          >
            <Link
              href="/account"
              className="flex h-7 w-7 items-center justify-center rounded-md text-secondary transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={labels.home}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
              </svg>
            </Link>
            {crumbGroup && (
              <>
                <span aria-hidden className="text-border">
                  /
                </span>
                <span className="truncate text-secondary">{crumbGroup}</span>
              </>
            )}
            {crumbItem && (
              <>
                <span aria-hidden className="text-border">
                  /
                </span>
                <span className="truncate font-semibold text-foreground" aria-current="page">
                  {crumbItem}
                </span>
              </>
            )}
          </nav>

          {/* Глобальный поиск (T-V09): GET-форма → /search?q= */}
          <form action="/search" className="ml-auto flex min-w-0 items-center" role="search">
            <input
              type="search"
              name="q"
              placeholder={labels.searchPh}
              aria-label={labels.searchPh}
              data-testid="global-search"
              className="w-32 rounded-xl border border-border bg-white/85 px-3 py-2 text-sm text-foreground shadow-xs transition-[width,box-shadow] duration-200 placeholder:text-secondary/65 focus:w-60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:w-44"
            />
          </form>

          {/* Помощь: запуск тура */}
          <button
            type="button"
            data-testid="topbar-help"
            aria-label="Tour"
            onClick={() => setHelpOpen(true)}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border bg-white/80 text-secondary shadow-xs hover:-translate-y-0.5 hover:border-accent/30 hover:bg-accent-soft hover:text-accent hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
              <path d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          </button>

          {/* Тенант-бейдж справа */}
          <span className="hidden items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-secondary md:flex">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
            {labels.brandSub}
          </span>
        </header>
        <div className="min-w-0 flex-1">{children}</div>
      </div>

      {/* Контекстный справочник (T-H35) */}
      <HelpPanel
        entry={helpEntry}
        labels={help.labels}
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onStartTour={() => {
          setHelpOpen(false);
          setTourSignal((s) => s + 1);
        }}
      />

      {/* Интерактивный тур (T-H34) */}
      <Suspense fallback={null}>
        <ProductTour steps={tour.steps} labels={tour.labels} startSignal={tourSignal} />
      </Suspense>
    </div>
  );
}
