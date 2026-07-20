import { describe, expect, it } from 'vitest';
import { extractRecords } from '../src/connectors/providers/http-json.provider';

/** T-V39: извлечение массива записей из JSON-ответа по dot-пути. */
describe('extractRecords', () => {
  it('верхнеуровневый массив — как есть', () => {
    expect(extractRecords([{ a: 1 }, { a: 2 }])).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('dot-путь к вложенному массиву', () => {
    const json = { data: { items: [{ id: 1 }, { id: 2 }] } };
    expect(extractRecords(json, 'data.items')).toHaveLength(2);
  });

  it('один объект → массив из одного', () => {
    expect(extractRecords({ id: 1 })).toEqual([{ id: 1 }]);
  });

  it('нет ключа по пути → ошибка', () => {
    expect(() => extractRecords({ data: {} }, 'data.items')).toThrow(/items/);
  });

  it('элемент-не-объект → ошибка', () => {
    expect(() => extractRecords([1, 2, 3])).toThrow(/не объект/);
  });

  it('путь в примитив → ошибка', () => {
    expect(() => extractRecords({ a: 5 }, 'a.b')).toThrow();
  });
});
