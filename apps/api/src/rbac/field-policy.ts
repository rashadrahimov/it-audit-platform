/**
 * Field-level политика (SEC-04, T-H03, ADR-0020) — чистые хелперы enforcement'а.
 * levels: field → hidden|view|edit. Поле без записи в levels не ограничено.
 */

export type FieldLevel = 'hidden' | 'view' | 'edit';
export type FieldLevels = Record<string, FieldLevel>;

/** Чтение: убрать hidden-поля из объекта перед отдачей. Прочие поля не трогаем. */
export function maskFields<T extends Record<string, unknown>>(obj: T, levels: FieldLevels): T {
  const hidden = Object.keys(levels).filter((k) => levels[k] === 'hidden');
  if (hidden.length === 0) return obj;
  const out = { ...obj };
  for (const k of hidden) delete out[k];
  return out;
}

/**
 * Запись: поля во входе, чей уровень явно ограничен (не 'edit'). Пустой массив =
 * можно писать. Поля без записи в levels свободны (наследуют entity-level право).
 */
export function rejectedWriteFields(input: Record<string, unknown>, levels: FieldLevels): string[] {
  return Object.keys(input).filter((k) => k in levels && levels[k] !== 'edit');
}
