import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // Миграции — под владельцем схемы; рантайм app ходит под ролью app (см. src/env.ts)
    url: process.env.DATABASE_URL_OWNER ?? 'postgres://audit:audit@localhost:5433/audit',
  },
});
