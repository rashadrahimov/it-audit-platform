import Link from 'next/link';
import { activeFilter, type SearchParams } from '@/lib/filters';

export interface FilterGroup {
  param: string;
  label: string;
  options: { value: string; label: string }[];
}

/**
 * T-V16: единая фильтр-панель списков — чипы-ссылки, состояние живёт в searchParams
 * (server-first, без клиентского JS). Чип группы сохраняет значения остальных групп.
 */
export function FilterBar({
  basePath,
  sp,
  groups,
  allLabel,
  keep = [],
}: {
  basePath: string;
  sp: SearchParams;
  groups: FilterGroup[];
  allLabel: string;
  /** прочие searchParams, которые нужно сохранять в ссылках (напр. archived) */
  keep?: string[];
}) {
  const params = groups.map((g) => g.param);
  const href = (param: string, value?: string) => {
    const qs = new URLSearchParams();
    for (const key of [...params, ...keep]) {
      const v = key === param ? value : activeFilter(sp, key);
      if (v) qs.set(key, v);
    }
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const chip = (on: boolean) =>
    `inline-flex min-h-8 items-center rounded-lg px-2.5 py-1.5 text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
      on
        ? 'bg-accent text-on-primary shadow-[0_4px_12px_rgb(7_134_95/0.18)]'
        : 'bg-transparent text-secondary hover:bg-accent-soft hover:text-accent'
    }`;

  return (
    <div
      data-testid="filter-bar"
      className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface/75 p-3.5 shadow-xs backdrop-blur"
    >
      {groups.map((g) => {
        const active = activeFilter(sp, g.param);
        return (
          <div key={g.param} className="flex flex-wrap items-center gap-1">
            <span className="min-w-20 px-1 text-[11px] font-semibold tracking-wide text-secondary uppercase">
              {g.label}
            </span>
            <Link href={href(g.param, undefined)} className={chip(!active)}>
              {allLabel}
            </Link>
            {g.options.map((o) => (
              <Link
                key={o.value}
                href={href(g.param, o.value)}
                className={chip(active === o.value)}
              >
                {o.label}
              </Link>
            ))}
          </div>
        );
      })}
    </div>
  );
}
