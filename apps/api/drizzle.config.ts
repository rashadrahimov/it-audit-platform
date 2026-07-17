import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // Дефолт совпадает с docker-compose (хост-порт 5433) и src/env.ts
    url: process.env.DATABASE_URL ?? 'postgres://audit:audit@localhost:5433/audit',
  },
});
