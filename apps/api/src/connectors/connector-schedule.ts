/**
 * T-V38: чистые хелперы расписания/конфига коннектора — без БД, тестируются юнитами.
 */

/** Минимальный интервал автосинка (мин): не чаще раза в 5 минут (защита от долбёжки). */
export const MIN_SYNC_INTERVAL_MIN = 5;
/** Максимум: раз в 31 день. */
export const MAX_SYNC_INTERVAL_MIN = 44_640;

/**
 * Нормализовать интервал автосинка. null/0/отрицательное/NaN → null (ручной режим);
 * иначе округляется и клампится в [MIN, MAX].
 */
export function clampSyncInterval(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(MAX_SYNC_INTERVAL_MIN, Math.max(MIN_SYNC_INTERVAL_MIN, Math.round(value)));
}

/**
 * Частичный мерж конфига: переданные ключи перекрывают текущие. Пустая строка ('')
 * ИГНОРИРУЕТСЯ — поэтому оставленное пустым secret-поле (пароль) сохраняет старое значение.
 */
export function mergeConfig(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === 'string' && value === '') continue;
    merged[key] = value;
  }
  return merged;
}

/**
 * Пора ли автосинкать коннектор: intervalMinutes задан (>0) и с последнего успешного
 * прогона прошло ≥ interval. lastSyncAt=null → да (ни разу не синкали).
 */
export function isDue(lastSyncAt: Date | null, intervalMinutes: number | null, now: Date): boolean {
  if (!intervalMinutes || intervalMinutes <= 0) return false;
  if (!lastSyncAt) return true;
  const elapsedMin = (now.getTime() - lastSyncAt.getTime()) / 60_000;
  return elapsedMin >= intervalMinutes;
}
