import { describe, expect, it } from 'vitest';
import {
  MAX_SYNC_INTERVAL_MIN,
  MIN_SYNC_INTERVAL_MIN,
  clampSyncInterval,
  isDue,
  mergeConfig,
} from '../src/connectors/connector-schedule';

/** T-V38: чистые хелперы расписания/конфига автосинка коннекторов. */

describe('clampSyncInterval', () => {
  it('null/0/отрицательное/NaN → null (ручной режим)', () => {
    expect(clampSyncInterval(null)).toBeNull();
    expect(clampSyncInterval(undefined)).toBeNull();
    expect(clampSyncInterval(0)).toBeNull();
    expect(clampSyncInterval(-5)).toBeNull();
    expect(clampSyncInterval(Number.NaN)).toBeNull();
  });

  it('клампит в [MIN, MAX] и округляет', () => {
    expect(clampSyncInterval(1)).toBe(MIN_SYNC_INTERVAL_MIN);
    expect(clampSyncInterval(60)).toBe(60);
    expect(clampSyncInterval(60.6)).toBe(61);
    expect(clampSyncInterval(999_999)).toBe(MAX_SYNC_INTERVAL_MIN);
  });
});

describe('mergeConfig', () => {
  it('переданные ключи перекрывают текущие', () => {
    expect(mergeConfig({ url: 'a', bindDn: 'x' }, { url: 'b' })).toEqual({ url: 'b', bindDn: 'x' });
  });

  it('пустая строка игнорируется — пустой пароль сохраняет старый', () => {
    const merged = mergeConfig(
      { bindPassword: 'secret', url: 'a' },
      { bindPassword: '', url: 'b' },
    );
    expect(merged.bindPassword).toBe('secret');
    expect(merged.url).toBe('b');
  });

  it('не-строковые значения проходят как есть (в т.ч. false/0)', () => {
    expect(mergeConfig({}, { active: false, n: 0 })).toEqual({ active: false, n: 0 });
  });
});

describe('isDue', () => {
  const now = new Date('2026-07-20T12:00:00Z');

  it('интервал не задан → никогда', () => {
    expect(isDue(null, null, now)).toBe(false);
    expect(isDue(new Date('2026-07-20T00:00:00Z'), 0, now)).toBe(false);
  });

  it('ни разу не синкали (lastSyncAt=null) → пора', () => {
    expect(isDue(null, 60, now)).toBe(true);
  });

  it('прошло меньше интервала → не пора', () => {
    expect(isDue(new Date('2026-07-20T11:30:00Z'), 60, now)).toBe(false);
  });

  it('прошло ≥ интервала → пора', () => {
    expect(isDue(new Date('2026-07-20T11:00:00Z'), 60, now)).toBe(true);
    expect(isDue(new Date('2026-07-20T10:30:00Z'), 60, now)).toBe(true);
  });
});
