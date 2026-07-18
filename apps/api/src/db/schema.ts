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
  type AnyPgColumn,
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

/**
 * Framework — стандарт (T-030, ADR-0016): tenant_id NULL = глобальная библиотека
 * (курируем мы), тенантская адаптация ссылается на оригинал через source_framework_id.
 * Обновление версии стандарта = новая строка (tracked changes — EP-FWK).
 */
export const framework = pgTable(
  'framework',
  {
    id: id(),
    tenantId: uuid('tenant_id').references(() => tenant.id),
    nameI18n: jsonb('name_i18n').$type<I18nText>().notNull(),
    /** Версия издания стандарта: «2022», «2019», «2.0». */
    version: text('version').notNull(),
    status: text('status').notNull().default('published'),
    sourceFrameworkId: uuid('source_framework_id').references((): AnyPgColumn => framework.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('framework_tenant_idx').on(table.tenantId)],
);

/**
 * Пункт стандарта (A.5.1, EDM01…): единственный источник ссылок на стандарты
 * (ADR-0004); иерархия пунктов через parent_id (data-model §11.2).
 */
export const frameworkRequirement = pgTable(
  'framework_requirement',
  {
    id: id(),
    frameworkId: uuid('framework_id')
      .notNull()
      .references(() => framework.id, { onDelete: 'cascade' }),
    ref: text('ref').notNull(),
    titleI18n: jsonb('title_i18n').$type<I18nText>().notNull(),
    textI18n: jsonb('text_i18n').$type<I18nText>(),
    parentId: uuid('parent_id').references((): AnyPgColumn => frameworkRequirement.id),
    ...timestamps,
  },
  (table) => [uniqueIndex('framework_requirement_fw_ref_idx').on(table.frameworkId, table.ref)],
);

/** Таксономия контролей (16 доменов чеклиста клиента: GOV/AC/CM/…). tenant_id NULL = глобальная. */
export const controlDomain = pgTable(
  'control_domain',
  {
    id: id(),
    tenantId: uuid('tenant_id').references(() => tenant.id),
    code: text('code').notNull(),
    nameI18n: jsonb('name_i18n').$type<I18nText>().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('control_domain_tenant_code_idx').on(table.tenantId, table.code)],
);

/**
 * Control (T-031, ADR-0016 global+override): 4 поля чеклиста клиента
 * (ref/domain/objective/question), guidance и custom — задел GEN-07.
 * owner подключится к membership в T-032.
 */
export const control = pgTable(
  'control',
  {
    id: id(),
    tenantId: uuid('tenant_id').references(() => tenant.id),
    originControlId: uuid('origin_control_id').references((): AnyPgColumn => control.id),
    ref: text('ref').notNull(),
    domainId: uuid('domain_id')
      .notNull()
      .references(() => controlDomain.id),
    objectiveI18n: jsonb('objective_i18n').$type<I18nText>().notNull(),
    questionI18n: jsonb('question_i18n').$type<I18nText>().notNull(),
    guidanceI18n: jsonb('guidance_i18n').$type<I18nText>(),
    ownerMembershipId: uuid('owner_membership_id').references(() => membership.id),
    status: text('status').notNull().default('active'),
    custom: jsonb('custom').notNull().default({}),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('control_tenant_ref_idx').on(table.tenantId, table.ref),
    index('control_domain_idx').on(table.domainId),
  ],
);

/** Control↔Requirement M:N — мультифреймворк-маппинг (Vanta-паттерн, ADR-0004). */
export const controlMapping = pgTable(
  'control_mapping',
  {
    id: id(),
    controlId: uuid('control_id')
      .notNull()
      .references(() => control.id, { onDelete: 'cascade' }),
    requirementId: uuid('requirement_id')
      .notNull()
      .references(() => frameworkRequirement.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [uniqueIndex('control_mapping_pair_idx').on(table.controlId, table.requirementId)],
);

/** Тип аудита — lookup UNI-06 (сид: operational/financial/it/compliance/quality/advisory). */
export const auditType = pgTable(
  'audit_type',
  {
    id: id(),
    tenantId: uuid('tenant_id').references(() => tenant.id),
    code: text('code').notNull(),
    nameI18n: jsonb('name_i18n').$type<I18nText>().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('audit_type_tenant_code_idx').on(table.tenantId, table.code)],
);

/**
 * Engagement — ядро (T-035, ADR-0005): одна state machine (§8 data-model),
 * режим formal/light выбирается при создании. opinion_id/plan_item_id
 * придут со своими lookup/plan-задачами (ENG-09, UNI-x).
 */
export const engagement = pgTable(
  'engagement',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    subsidiaryId: uuid('subsidiary_id')
      .notNull()
      .references(() => subsidiary.id),
    auditTypeId: uuid('audit_type_id').references(() => auditType.id),
    titleI18n: jsonb('title_i18n').$type<I18nText>().notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    mode: text('mode').notNull().default('formal'),
    state: text('state').notNull().default('draft'),
    /** Откуда ушли в paused — resume возвращает ровно туда (SCH-06). */
    pausedFromState: text('paused_from_state'),
    custom: jsonb('custom').notNull().default({}),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('engagement_tenant_idx').on(table.tenantId)],
);

/** Вехи стадий (ENG-03): план/факт; факт проставляется переходом state machine. */
export const engagementMilestone = pgTable(
  'engagement_milestone',
  {
    id: id(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagement.id, { onDelete: 'cascade' }),
    stage: text('stage').notNull(),
    plannedDate: timestamp('planned_date', { withTimezone: true }),
    actualDate: timestamp('actual_date', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex('engagement_milestone_stage_idx').on(table.engagementId, table.stage)],
);

/**
 * Пункт чеклиста engagement'а (T-036) — СНАПШОТ контроля на момент включения
 * (data-model §10.1): текст копируется, правка библиотеки не меняет выпущенные
 * отчёты. control_id — только origin-ссылка.
 */
export const checklistItem = pgTable(
  'checklist_item',
  {
    id: id(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagement.id, { onDelete: 'cascade' }),
    controlId: uuid('control_id').references(() => control.id),
    ref: text('ref').notNull(),
    domainCode: text('domain_code'),
    objectiveI18n: jsonb('objective_i18n').$type<I18nText>().notNull(),
    questionI18n: jsonb('question_i18n').$type<I18nText>().notNull(),
    order: integer('order').notNull(),
    assignedRespondentId: uuid('assigned_respondent_id').references(() => membership.id),
    status: text('status').notNull().default('pending'),
    ...timestamps,
  },
  (table) => [index('checklist_item_engagement_idx').on(table.engagementId, table.order)],
);

/**
 * Ответ респондента (T-037, «вторая колонка» чеклиста клиента): один на пункт,
 * compliance_status — enum чеклиста (конфигурируемые lookup'ы — EP-CONFIG).
 * Evidence придёт связкой document_link (T-034).
 */
export const response = pgTable(
  'response',
  {
    id: id(),
    checklistItemId: uuid('checklist_item_id')
      .notNull()
      .references(() => checklistItem.id, { onDelete: 'cascade' }),
    respondentMembershipId: uuid('respondent_membership_id')
      .notNull()
      .references(() => membership.id),
    text: text('text').notNull(),
    complianceStatus: text('compliance_status').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [uniqueIndex('response_checklist_item_idx').on(table.checklistItemId)],
);

/**
 * Документ (T-034, data-model §6): метаданные поверх S3-хранилища (T-042).
 * Новая версия = новая строка (prev_version_id); folder_id придёт с WP-04.
 */
export const document = pgTable(
  'document',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    storageKey: text('storage_key').notNull(),
    filename: text('filename').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    version: integer('version').notNull().default(1),
    prevVersionId: uuid('prev_version_id').references((): AnyPgColumn => document.id),
    ownerMembershipId: uuid('owner_membership_id')
      .notNull()
      .references(() => membership.id),
    /** Cadence: дата, к которой доказательство надо обновить (renew-by). */
    renewBy: timestamp('renew_by', { withTimezone: true }),
    status: text('status').notNull().default('active'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('document_tenant_idx').on(table.tenantId)],
);

/**
 * Полиморфная привязка документа (data-model §10.5): evidence/permanent_file/
 * attachment/report; одна версия файла видна из многих мест (WP-05).
 */
export const documentLink = pgTable(
  'document_link',
  {
    id: id(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => document.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    relation: text('relation').notNull().default('evidence'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('document_link_triple_idx').on(table.documentId, table.entityType, table.entityId),
    index('document_link_entity_idx').on(table.entityType, table.entityId),
  ],
);

/**
 * Test — проверка контроля (T-033, ADR-0010): Control 1→N Test; ручные сейчас,
 * автоматические получат connector_id/check_config с EP-INT. sla_status статичен
 * до джобы T-043. status: ok/failing/needs_attention/deactivated.
 */
export const test = pgTable(
  'test',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    controlId: uuid('control_id')
      .notNull()
      .references(() => control.id),
    titleI18n: jsonb('title_i18n').$type<I18nText>().notNull(),
    kind: text('kind').notNull().default('manual'),
    checkConfig: jsonb('check_config'),
    frequency: text('frequency'),
    ownerMembershipId: uuid('owner_membership_id').references(() => membership.id),
    dueDate: timestamp('due_date', { withTimezone: true }),
    slaStatus: text('sla_status').notNull().default('ok'),
    status: text('status').notNull().default('needs_attention'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('test_tenant_idx').on(table.tenantId),
    index('test_control_idx').on(table.controlId),
  ],
);

/** Результат прогона (ADR-0010): outcome двигает статус теста; failing_entities — кто не прошёл. */
export const testResult = pgTable(
  'test_result',
  {
    id: id(),
    testId: uuid('test_id')
      .notNull()
      .references(() => test.id, { onDelete: 'cascade' }),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    outcome: text('outcome').notNull(),
    failingEntities: jsonb('failing_entities').notNull().default([]),
    evidenceDocumentId: uuid('evidence_document_id').references(() => document.id),
    details: jsonb('details').notNull().default({}),
    ...timestamps,
  },
  (table) => [index('test_result_test_idx').on(table.testId, table.runAt)],
);

/**
 * Finding — «третья колонка» чеклиста клиента (T-038, data-model §5): gap как риск.
 * Standalone допустим (все привязки NULL). Поля retest/resolution двигает
 * lifecycle T-039; sla_status статичен до T-043; risk_id придёт с EP-RISK.
 */
export const finding = pgTable(
  'finding',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    engagementId: uuid('engagement_id').references(() => engagement.id),
    checklistItemId: uuid('checklist_item_id').references(() => checklistItem.id),
    responseId: uuid('response_id').references(() => response.id),
    controlId: uuid('control_id').references(() => control.id),
    titleI18n: jsonb('title_i18n').$type<I18nText>().notNull(),
    descriptionI18n: jsonb('description_i18n').$type<I18nText>(),
    riskRating: text('risk_rating').notNull(),
    recommendationI18n: jsonb('recommendation_i18n').$type<I18nText>(),
    /** Auditee-side владелец действия (колонка Owner клиента). */
    ownerMembershipId: uuid('owner_membership_id').references(() => membership.id),
    /** Audit-side владелец finding'а. */
    auditorMembershipId: uuid('auditor_membership_id').references(() => membership.id),
    dueDate: timestamp('due_date', { withTimezone: true }),
    slaStatus: text('sla_status').notNull().default('ok'),
    status: text('status').notNull().default('identified'),
    remediatedAt: timestamp('remediated_at', { withTimezone: true }),
    retestResult: text('retest_result'),
    retestedBy: uuid('retested_by').references(() => membership.id),
    resolutionDate: timestamp('resolution_date', { withTimezone: true }),
    managementResponse: text('management_response'),
    /** T-039: дедуп суточных напоминаний о дедлайне. */
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
    custom: jsonb('custom').notNull().default({}),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('finding_tenant_idx').on(table.tenantId),
    index('finding_engagement_idx').on(table.engagementId),
  ],
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
