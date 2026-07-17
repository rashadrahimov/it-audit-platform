import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

/**
 * Схема БД — строго по docs/data-model.md (§1 паттерны, §2 identity).
 * T-010: tenant + subsidiary; остальные таблицы добавляются своими задачами.
 * PK — uuid v7 (сортируемость по времени), генерируется приложением:
 * в Postgres 17 нет uuidv7(), появится в 18 — тогда можно перенести в DEFAULT.
 */

/** Переводимый контент (ADR-0009): {"en": "...", "az": "...", "ru": "..."}, fallback EN. */
export type I18nText = { en: string; az?: string; ru?: string };

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Группа компаний. Над-тенантная таблица — без tenant_id (data-model §2). */
export const tenant = pgTable('tenant', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  settings: jsonb('settings').notNull().default({}),
  languageDefault: text('language_default').notNull().default('en'),
  ...timestamps,
});

/** Дочка группы. Доменная таблица: tenant_id NOT NULL — паттерн для всех последующих. */
export const subsidiary = pgTable(
  'subsidiary',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    nameI18n: jsonb('name_i18n').$type<I18nText>().notNull(),
    code: text('code'),
    country: text('country'),
    businessProfile: jsonb('business_profile').notNull().default({}),
    status: text('status').notNull().default('active'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('subsidiary_tenant_id_idx').on(table.tenantId)],
);
