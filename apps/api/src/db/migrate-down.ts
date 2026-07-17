/**
 * Откат последней применённой миграции. drizzle-kit генерирует только «вперёд»,
 * поэтому к каждой миграции руками пишется парный drizzle/down/<tag>.down.sql,
 * а этот раннер исполняет его и снимает запись из журнала drizzle.
 * Запуск: pnpm db:migrate:down (из корня) — после pnpm build.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import { env } from '../env';

const drizzleDir = resolve(__dirname, '../../drizzle');

interface JournalEntry {
  idx: number;
  tag: string;
}

async function main(): Promise<void> {
  const journal = JSON.parse(readFileSync(join(drizzleDir, 'meta/_journal.json'), 'utf8')) as {
    entries: JournalEntry[];
  };

  const client = new Client({ connectionString: env.databaseUrlOwner });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: number }>(
      'SELECT id FROM drizzle.__drizzle_migrations ORDER BY id',
    );
    const lastRow = rows.at(-1);
    if (!lastRow) {
      console.log('Журнал миграций пуст — откатывать нечего.');
      return;
    }
    const entry = journal.entries[rows.length - 1];
    if (!entry) {
      throw new Error(
        `В журнале БД ${rows.length} миграций, а в meta/_journal.json — ${journal.entries.length}: рассинхрон`,
      );
    }
    const downSql = readFileSync(join(drizzleDir, 'down', `${entry.tag}.down.sql`), 'utf8');

    await client.query('BEGIN');
    try {
      await client.query(downSql);
      await client.query('DELETE FROM drizzle.__drizzle_migrations WHERE id = $1', [lastRow.id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    console.log(`Откатана миграция ${entry.tag}.`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error('Откат провалился:', error instanceof Error ? error.message : error);
  process.exit(1);
});
