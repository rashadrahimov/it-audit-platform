import { BadRequestException } from '@nestjs/common';

/**
 * Валидация query-фильтров списков (T-V16). Статусы/типы — text-колонки без pgEnum,
 * поэтому неизвестное значение безопасно (пустая выдача); отсекаем только мусорный формат.
 */
const SLUG_RE = /^[a-zA-Z0-9_.-]{1,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function filterParam(value: string | undefined, name: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (!SLUG_RE.test(value)) {
    throw new BadRequestException(`Недопустимое значение фильтра ${name}`);
  }
  return value;
}

export function uuidFilterParam(value: string | undefined, name: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (!UUID_RE.test(value)) {
    throw new BadRequestException(`Фильтр ${name} должен быть UUID`);
  }
  return value;
}
