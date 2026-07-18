import { describe, expect, it } from 'vitest';
import { localeSchema } from '@it-audit/shared';
import en from './en.json';
import az from './az.json';
import ru from './ru.json';

const catalogs = { en, az, ru } as const;

// плоский список ключей вида "home.title" — сравнимость каталогов
function keysOf(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value !== null && typeof value === 'object'
      ? keysOf(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('каталоги переводов UI (T-022, ADR-0009)', () => {
  it('есть каталог на каждый язык продукта', () => {
    expect(Object.keys(catalogs).sort()).toEqual([...localeSchema.options].sort());
  });

  it('ключи az/ru совпадают с en — ничего не потеряно и нет сирот', () => {
    const enKeys = keysOf(en).sort();
    expect(keysOf(az).sort()).toEqual(enKeys);
    expect(keysOf(ru).sort()).toEqual(enKeys);
  });
});
