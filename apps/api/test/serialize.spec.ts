import { describe, expect, it } from 'vitest';
import { csvCell, xmlEscape } from '../src/reports-export/serialize';

/** DoD T-098/T-A21: экранирование ячеек выгрузки CSV/XML. Чистые функции. */
describe('csvCell (RFC-4180)', () => {
  it('простое значение — без кавычек', () => {
    expect(csvCell('abc')).toBe('abc');
    expect(csvCell(42)).toBe('42');
  });
  it('null/undefined → пустая строка', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
  it('запятая → кавычим', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
  });
  it('перевод строки → кавычим', () => {
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });
  it('кавычки → кавычим и удваиваем', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });
  it('ложь и ноль сериализуются, не превращаются в пусто', () => {
    expect(csvCell(0)).toBe('0');
    expect(csvCell(false)).toBe('false');
  });
});

describe('xmlEscape', () => {
  it('амперсанд экранируется первым (без двойного экранирования)', () => {
    expect(xmlEscape('a & b')).toBe('a &amp; b');
    expect(xmlEscape('<tag>')).toBe('&lt;tag&gt;');
  });
  it('кавычки экранируются', () => {
    expect(xmlEscape('say "hi"')).toBe('say &quot;hi&quot;');
  });
  it('комбинация спецсимволов', () => {
    expect(xmlEscape('<a href="x">1 & 2</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;1 &amp; 2&lt;/a&gt;',
    );
  });
  it('null/undefined → пустая строка', () => {
    expect(xmlEscape(null)).toBe('');
    expect(xmlEscape(undefined)).toBe('');
  });
});
