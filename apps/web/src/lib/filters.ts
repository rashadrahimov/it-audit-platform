/** T-V16: работа с query-фильтрами списков (значения — слаги, как в api/list-filters). */
const VALUE_RE = /^[a-zA-Z0-9_.-]{1,64}$/;

export type SearchParams = Record<string, string | string[] | undefined>;

/** Активное значение фильтра из searchParams (или undefined, если нет/мусор). */
export function activeFilter(sp: SearchParams, key: string): string | undefined {
  const value = sp[key];
  return typeof value === 'string' && VALUE_RE.test(value) ? value : undefined;
}

/** Хвост query-строки для apiFetch («&k=v…» или пустая строка) из разрешённых ключей. */
export function filterQuery(sp: SearchParams, keys: readonly string[]): string {
  const parts: string[] = [];
  for (const key of keys) {
    const value = activeFilter(sp, key);
    if (value) parts.push(`${key}=${encodeURIComponent(value)}`);
  }
  return parts.length ? `&${parts.join('&')}` : '';
}
