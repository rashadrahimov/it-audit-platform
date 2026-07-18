import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import type { I18nText } from '@it-audit/shared';

/**
 * Схема БД — строго по docs/data-model.md (§1 паттерны, §2 identity).
 * T-010: tenant + subsidiary; остальные таблицы добавляются своими задачами.
 * PK — uuid v7 (сортируемость по времени), генерируется приложением:
 * в Postgres 17 нет uuidv7(), появится в 18 — тогда можно перенести в DEFAULT.
 */

/** Переводимый контент (ADR-0009) — контракт i18nTextSchema в shared (T-022). */
export type { I18nText };

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
  /** sha256-хеши одноразовых recovery-кодов (T-014); использованный удаляется. */
  mfaRecoveryCodes: jsonb('mfa_recovery_codes').$type<string[]>(),
  status: text('status').notNull().default('active'),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  ...timestamps,
});

/** Глобальный каталог прав (ADR-0013): resource × action. Без tenant_id и RLS. */
export const permission = pgTable(
  'permission',
  {
    id: id(),
    resource: text('resource').notNull(),
    action: text('action').notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('permission_resource_action_idx').on(table.resource, table.action)],
);

/** Роль: tenant_id NULL = системный пресет (ADR-0016-паттерн); RLS без FORCE — сид пресетов идёт под owner. */
export const role = pgTable('role', {
  id: id(),
  tenantId: uuid('tenant_id').references(() => tenant.id),
  nameI18n: jsonb('name_i18n').$type<I18nText>().notNull(),
  isSystem: boolean('is_system').notNull().default(false),
  ...timestamps,
});

/** Матрица роль×право (ADR-0013): уровень none/view/edit. */
export const rolePermission = pgTable(
  'role_permission',
  {
    id: id(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permission.id, { onDelete: 'cascade' }),
    level: text('level').notNull().default('none'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('role_permission_role_permission_idx').on(table.roleId, table.permissionId),
  ],
);

/**
 * Membership — User↔Tenant↔Role (ADR-0015). Единственная над-тенантная связь
 * модели (MTE-04); без RLS — читается при логине до установления контекста.
 * department/unit/scope-поля придут со своими задачами (T-012, оргструктура).
 */
export const membership = pgTable(
  'membership',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    roleId: uuid('role_id')
      .notNull()
      .references(() => role.id),
    category: text('category').notNull().default('auditor'),
    isAuditSeat: boolean('is_audit_seat').notNull().default(false),
    invitedBy: uuid('invited_by'),
    status: text('status').notNull().default('active'),
    ...timestamps,
  },
  (table) => [uniqueIndex('membership_user_tenant_idx').on(table.userId, table.tenantId)],
);

/** Лицензия тенанта (ADR-0014): лимиты по дочкам и audit-seats. Потребление считается запросом. */
export const license = pgTable(
  'license',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    plan: text('plan').notNull().default('standard'),
    maxSubsidiaries: integer('max_subsidiaries').notNull(),
    maxAuditSeats: integer('max_audit_seats').notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    /** perpetual/subscription — модель контракта пока открыта у клиента (T-001). */
    terms: text('terms').notNull().default('subscription'),
    ...timestamps,
  },
  (table) => [uniqueIndex('license_tenant_idx').on(table.tenantId)],
);

/**
 * Audit trail (T-021, LOG-01/02): append-only — UPDATE/DELETE отозваны у app в миграции.
 * prev_hash/hash заложены под tamper-protection (hash chain, EP-HARDEN).
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    /** NULL = системное событие вне тенанта. */
    tenantId: uuid('tenant_id'),
    /** NULL = система (джобы, авто-процессы). */
    actorUserId: uuid('actor_user_id'),
    actorIp: text('actor_ip'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    prevHash: text('prev_hash'),
    hash: text('hash'),
  },
  (table) => [index('audit_log_tenant_at_idx').on(table.tenantId, table.at)],
);

/** Журнал входов (LOG-04): login/logout/failed/locked с IP и user-agent. Append-only. */
export const authEvent = pgTable(
  'auth_event',
  {
    id: id(),
    /** NULL = попытка с несуществующим email. */
    userId: uuid('user_id'),
    event: text('event').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('auth_event_user_at_idx').on(table.userId, table.at)],
);

/** Полиморфные комментарии (T-023): entity_type+entity_id, soft-delete. */
export const comment = pgTable(
  'comment',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => user.id),
    body: text('body').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('comment_entity_idx').on(table.tenantId, table.entityType, table.entityId)],
);

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
