import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * DoD T-OPS03 (EP-OPS): у КАЖДОЙ миграции журнала обязана быть парная down-миграция.
 * drizzle-kit генерирует только «вперёд», пары пишутся руками — и уже дважды забывались
 * (0073/0074), из-за чего откат прода глубже последней миграции падал с ENOENT.
 * Тест чистый: только файловая система, без БД и инфраструктуры.
 */
const drizzleDir = resolve(__dirname, '../drizzle');

interface Journal {
  entries: Array<{ idx: number; tag: string }>;
}

const journal = JSON.parse(readFileSync(join(drizzleDir, 'meta/_journal.json'), 'utf8')) as Journal;
const downFiles = new Set(readdirSync(join(drizzleDir, 'down')));

describe('парность миграций up ↔ down (T-OPS03)', () => {
  it('журнал не пуст', () => {
    expect(journal.entries.length).toBeGreaterThan(70);
  });

  it('для каждой миграции есть down-файл', () => {
    const missing = journal.entries
      .map((e) => e.tag)
      .filter((tag) => !downFiles.has(`${tag}.down.sql`));
    expect(missing, `нет парных down-миграций: ${missing.join(', ')}`).toEqual([]);
  });

  it('каждый down-файл непустой и содержит SQL', () => {
    const empty = journal.entries
      .map((e) => e.tag)
      .filter((tag) => {
        const sql = readFileSync(join(drizzleDir, 'down', `${tag}.down.sql`), 'utf8');
        // комментарии не считаем содержимым — откат обязан что-то делать
        const meaningful = sql
          .split('\n')
          .filter((l) => l.trim() && !l.trim().startsWith('--'))
          .join('');
        return meaningful.length === 0;
      });
    expect(empty, `down-миграции без SQL: ${empty.join(', ')}`).toEqual([]);
  });

  it('нет осиротевших down-файлов без своей миграции', () => {
    const tags = new Set(journal.entries.map((e) => `${e.tag}.down.sql`));
    const orphans = [...downFiles].filter((f) => f.endsWith('.down.sql') && !tags.has(f));
    expect(orphans, `down без парной миграции: ${orphans.join(', ')}`).toEqual([]);
  });
});
