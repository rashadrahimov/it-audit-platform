import { describe, expect, it } from 'vitest';
import { localeSchema } from '@it-audit/shared';
import en from './en.json';
import az from './az.json';
import ru from './ru.json';
import { REQUIREMENT_COVERAGE } from '../app/roadmap/coverage';

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

  it('roadmap coverage не использует proof-ключи без переводов', () => {
    const evidenceKeys = new Set(REQUIREMENT_COVERAGE.flatMap((item) => item.evidence));
    for (const key of evidenceKeys) {
      expect(en.roadmap.coverage.evidence).toHaveProperty(key);
      expect(az.roadmap.coverage.evidence).toHaveProperty(key);
      expect(ru.roadmap.coverage.evidence).toHaveProperty(key);
    }
  });

  it('roadmap coverage includes latest privacy and follow-up proof chips', () => {
    const evidenceKeys = new Set(REQUIREMENT_COVERAGE.flatMap((item) => item.evidence));
    const requiredEvidence: Array<(typeof REQUIREMENT_COVERAGE)[number]['evidence'][number]> = [
      'ai-privacy-assurance',
      'no-training',
      'finding-follow-up-plan',
      'retest-workbench',
      'document-content-search',
    ];
    for (const key of requiredEvidence) {
      expect(evidenceKeys.has(key)).toBe(true);
    }
  });

  it('snapshots RU keeps visible page labels localized and product-term stable', () => {
    expect(ru.account.snapshots).toBe('Снапшоты');
    expect(ru.snapshots.title).toBe('Снапшоты');
    expect(ru.snapshots.create).toBe('Создать снапшот');
    expect(ru.snapshots.labelPh).toContain('закрытие Q3 2026');
    expect(ru.snapshots.createBtn).toBe('Зафиксировать');

    for (const key of ['title', 'create', 'labelPh', 'createBtn', 'viewComposition'] as const) {
      expect(ru.snapshots[key]).not.toBe(en.snapshots[key]);
    }
  });
});
