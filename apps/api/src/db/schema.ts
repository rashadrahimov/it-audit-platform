import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
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

/**
 * Пользователь — над-тенантный (ADR-0015), без RLS; тенант-связь появится в membership.
 * password_hash NULL = чистый SSO-аккаунт. Поля lockout — парольная политика SEC-01.
 */
export const user = pgTable('user', {
  id: id(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  locale: text('locale').notNull().default('en'),
  position: text('position'),
  certifications: jsonb('certifications').notNull().default([]),
  mfaTotpSecret: text('mfa_totp_secret'),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  status: text('status').notNull().default('active'),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
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
