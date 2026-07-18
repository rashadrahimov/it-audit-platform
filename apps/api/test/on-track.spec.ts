import { describe, expect, it } from 'vitest';
import { onTrack } from '../src/control-kpis/on-track';

/** DoD T-106/T-A18: расчёт on-track KPI по направлению. Чистая функция, БД не нужна. */
describe('onTrack (control KPI)', () => {
  describe('higher_better (по умолчанию)', () => {
    it('current >= target → on-track', () => {
      expect(onTrack('higher_better', 90, 95)).toBe(true);
      expect(onTrack('higher_better', 90, 90)).toBe(true);
    });
    it('current < target → off-track', () => {
      expect(onTrack('higher_better', 90, 80)).toBe(false);
    });
    it('неизвестное направление трактуется как higher_better', () => {
      expect(onTrack('whatever', 50, 60)).toBe(true);
      expect(onTrack('whatever', 50, 40)).toBe(false);
    });
  });

  describe('lower_better (напр. MTTR)', () => {
    it('current <= target → on-track', () => {
      expect(onTrack('lower_better', 24, 20)).toBe(true);
      expect(onTrack('lower_better', 24, 24)).toBe(true);
    });
    it('current > target → off-track', () => {
      expect(onTrack('lower_better', 24, 30)).toBe(false);
    });
  });

  describe('нет данных для сравнения → null', () => {
    it('target не задан', () => {
      expect(onTrack('higher_better', null, 95)).toBeNull();
    });
    it('current не задан', () => {
      expect(onTrack('lower_better', 24, null)).toBeNull();
    });
    it('оба не заданы', () => {
      expect(onTrack('higher_better', null, null)).toBeNull();
    });
  });

  describe('граничные значения', () => {
    it('нули и отрицательные', () => {
      expect(onTrack('higher_better', 0, 0)).toBe(true);
      expect(onTrack('lower_better', 0, -1)).toBe(true);
      expect(onTrack('lower_better', -5, -3)).toBe(false);
    });
  });
});
