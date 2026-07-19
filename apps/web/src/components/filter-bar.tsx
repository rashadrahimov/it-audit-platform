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
    `rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
      on ? 'bg-accent text-on-primary' : 'bg-muted text-secondary hover:bg-border'
    }`;

  return (
    <div data-testid="filter-bar" className="flex flex-col gap-2">
      {groups.map((g) => {
        const active = activeFilter(sp, g.param);
        return (
          <div key={g.param} className="flex flex-wrap items-center gap-1.5">
            <span className="min-w-16 text-xs font-medium text-secondary">{g.label}</span>
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
