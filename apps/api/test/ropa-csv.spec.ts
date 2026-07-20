import { describe, expect, it } from 'vitest';
import { parseCsvRecords, parseRopaCsv } from '../src/privacy/ropa-csv';

/** T-V55: парсер CSV-импорта реестра ROPA (GDPR Art.30). */
describe('parseCsvRecords', () => {
  it('разбивает поля и записи', () => {
    expect(parseCsvRecords('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('уважает кавычки с запятой и экранированной кавычкой внутри', () => {
    expect(parseCsvRecords('name\n"Doe, John ""JD"""')).toEqual([['name'], ['Doe, John "JD"']]);
  });

  it('поддерживает перевод строки внутри кавычек', () => {
    expect(parseCsvRecords('a\n"line1\nline2"')).toEqual([['a'], ['line1\nline2']]);
  });
});

describe('parseRopaCsv', () => {
  const header = 'name,legal_basis,role,purpose,data_categories,cross_border,data_locations';

  it('разбирает валидные строки, мульти-значения через ;', () => {
    const { rows, errors } = parseRopaCsv(
      `${header}\nPayroll,contract,processor,Salary,PII;Financial,yes,EU;US`,
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Payroll',
      legalBasis: 'contract',
      role: 'processor',
      purpose: 'Salary',
      dataCategories: ['PII', 'Financial'],
      crossBorder: true,
      dataLocations: ['EU', 'US'],
    });
  });

  it('неизвестный legal_basis → строка пропущена с ошибкой', () => {
    const { rows, errors } = parseRopaCsv(`${header}\nX,bogus,controller,,,,`);
    expect(rows).toHaveLength(0);
    expect(errors[0]).toContain('legal_basis');
  });

  it('пустое name → пропуск', () => {
    const { rows, errors } = parseRopaCsv(`${header}\n,consent,controller,,,,`);
    expect(rows).toHaveLength(0);
    expect(errors[0]).toContain('name');
  });

  it('неизвестная role → controller по умолчанию', () => {
    const { rows } = parseRopaCsv(`${header}\nA,consent,superuser,,,,`);
    expect(rows[0]?.role).toBe('controller');
  });

  it('заголовки терпимы к регистру/пробелам/алиасам', () => {
    const { rows } = parseRopaCsv('Name, Legal Basis, Cross Border\nA,consent,true');
    expect(rows[0]).toMatchObject({ name: 'A', legalBasis: 'consent', crossBorder: true });
  });

  it('нет обязательных колонок → ошибка, ноль строк', () => {
    const { rows, errors } = parseRopaCsv('foo,bar\n1,2');
    expect(rows).toHaveLength(0);
    expect(errors[0]).toContain('Обязательные колонки');
  });

  it('пустой CSV → ошибка', () => {
    expect(parseRopaCsv('').errors[0]).toContain('пуст');
  });
});
