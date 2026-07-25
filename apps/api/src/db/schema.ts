import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
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
 * Field-level права (SEC-04, T-H03, ADR-0020): оверлей поверх матрицы.
 * level ∈ hidden|view|edit. Отсутствие строки = наследование entity-level права.
 */
export const fieldPermission = pgTable(
  'field_permission',
  {
    id: id(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    field: text('field').notNull(),
    level: text('level').notNull().default('view'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('field_permission_role_entity_field_idx').on(
      table.roleId,
      table.entityType,
      table.field,
    ),
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
    /** T-V50: internal (сотрудник тенанта) | auditor (внешний аудитор — scoped-nav). */
    category: text('category').notNull().default('internal'),
    isAuditSeat: boolean('is_audit_seat').notNull().default(false),
    invitedBy: uuid('invited_by'),
    status: text('status').notNull().default('active'),
    /** T-012: NULL = вся группа; массив subsidiary_id = member видит только эти дочки. */
    subsidiaryScope: jsonb('subsidiary_scope').$type<string[] | null>(),
    /** T-044: департамент member'а (unit придёт с CRUD оргструктуры). */
    departmentId: uuid('department_id'),
    /**
     * T-110: окно доступа (time-boxed) — когда участник (внешний аудитор) реально
     * имеет доступ, отдельно от аудируемого периода engagement. NULL = без границы
     * (бессрочно). Вне окна resolveAccess отказывает.
     */
    dataAccessFrom: timestamp('data_access_from', { withTimezone: true }),
    dataAccessUntil: timestamp('data_access_until', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex('membership_user_tenant_idx').on(table.userId, table.tenantId)],
);

/** Оргструктура (T-044, data-model §2): subsidiary_id NULL = департамент уровня группы. */
export const department = pgTable(
  'department',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    subsidiaryId: uuid('subsidiary_id'),
    nameI18n: jsonb('name_i18n').$type<I18nText>().notNull(),
    ...timestamps,
  },
  (table) => [index('department_tenant_idx').on(table.tenantId)],
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

/**
 * Magic-link токены (passwordless-вход): над-тенантные, как user/auth_event —
 * запрос приходит на этапе логина, до установления tenant-контекста, поэтому без RLS.
 * Храним только sha256-хеш токена (утечка БД не даёт рабочих ссылок); одноразовость —
 * через consumed_at, ограничение жизни — expires_at.
 */
export const magicLinkToken = pgTable(
  'magic_link_token',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    requestedIp: text('requested_ip'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('magic_link_token_hash_idx').on(table.tokenHash),
    index('magic_link_token_user_idx').on(table.userId),
  ],
);

/**
 * Per-tenant SSO-конфиг (V49, ADR-0021): маршрутизация логина на IdP тенанта по
 * домену e-mail (home-realm discovery). Над-тенантная, без RLS — читается на этапе
 * логина до tenant-контекста (как user/membership); изоляция тенантов — в CRUD-коде
 * по tenant_id из guard. Домен уникален глобально. Client secret — AES-256-GCM.
 */
export const ssoConfig = pgTable(
  'sso_config',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    emailDomain: text('email_domain').notNull().unique(),
    method: text('method').notNull(),
    providerLabel: text('provider_label').notNull(),
    issuerUrl: text('issuer_url'),
    clientId: text('client_id'),
    secretEncrypted: text('secret_encrypted'),
    metadataUrl: text('metadata_url'),
    enabled: boolean('enabled').notNull().default(true),
    ...timestamps,
  },
  (table) => [index('sso_config_tenant_idx').on(table.tenantId)],
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
    /** T-V25: домен каталога — security | privacy | industry | custom. */
    domain: text('domain'),
    sourceFrameworkId: uuid('source_framework_id').references((): AnyPgColumn => framework.id),
    /** T-V46: предыдущая версия этого же стандарта (для diff требований). */
    previousVersionId: uuid('previous_version_id').references((): AnyPgColumn => framework.id),
    /** T-V46: заметки к выпуску новой версии (tracked changes). */
    updateNotes: text('update_notes'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('framework_tenant_idx').on(table.tenantId)],
);

/** T-V25: активация фреймворка тенантом (Active/Available в каталоге). */
export const frameworkActivation = pgTable(
  'framework_activation',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    frameworkId: uuid('framework_id')
      .notNull()
      .references(() => framework.id, { onDelete: 'cascade' }),
    /** T-V33: целевая дата audit-ready для roadmap-прогресса. */
    targetDate: timestamp('target_date', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex('framework_activation_pair_idx').on(table.tenantId, table.frameworkId)],
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

/** Таксономия контролей (32 домена CBAR/ISO-based IT audit methodology). tenant_id NULL = глобальная. */
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
    /** Бюджет часов на аудит (T-089, UNI-07): сравнение план vs факт. */
    budgetedHours: numeric('budgeted_hours', { precision: 8, scale: 2 }),
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
 * T-116 (GEN-08/SCH-02, data-model §5): состав аудит-команды на engagement с
 * ролью. Роль ограничивает права по стадиям (наша добавка D2: иерархия
 * assessor/reviewer/approver). Стаффинг по часам — отдельно в resource_allocation.
 */
export const engagementMember = pgTable(
  'engagement_member',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagement.id, { onDelete: 'cascade' }),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => membership.id),
    /** lead | assessor | reviewer | approver | observer */
    engagementRole: text('engagement_role').notNull(),
    /** Переопределение прав по стадиям: {stage: 'read-only'|'hidden'|'edit'}. */
    stagePermissions: jsonb('stage_permissions').$type<Record<string, string> | null>(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('engagement_member_unique_idx').on(table.engagementId, table.membershipId),
  ],
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
    /** T-V02 lifecycle: needs_document | draft | active | overdue. */
    status: text('status').notNull().default('active'),
    /** T-V02: категория документа (policy/report/evidence/contract/…). */
    category: text('category'),
    /**
     * T-H123 / DAT-04: извлечённый searchable text для документов, где это можно
     * сделать безопасно в момент upload (txt/json/xml/csv/log/yaml/conf). PDF/Office
     * помечаются pending до отдельного extraction/OCR pipeline.
     */
    extractedText: text('extracted_text'),
    extractionStatus: text('extraction_status').notNull().default('pending'),
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
    /**
     * T-112: статус review доказательства аудитором (Vanta evidence tracker):
     * not_ready → ready (auditee готов) → accepted / flagged / not_applicable (вердикт аудитора).
     */
    reviewStatus: text('review_status').notNull().default('not_ready'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('document_link_triple_idx').on(table.documentId, table.entityType, table.entityId),
    index('document_link_entity_idx').on(table.entityType, table.entityId),
  ],
);

/**
 * T-113: аудиторская оценка (Auditor Assessment) — вердикт аудитора по пункту
 * аудита (checklist_item/finding), ОТДЕЛЬНО от самооценки auditee
 * (response.compliance_status). Append-only лог раундов (round растёт на цель).
 */
export const auditorAssessment = pgTable(
  'auditor_assessment',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    /** checklist_item | finding — пункт аудита, который оценивает аудитор. */
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    assessorMembershipId: uuid('assessor_membership_id')
      .notNull()
      .references(() => membership.id),
    /** satisfactory | exception | not_applicable — вердикт аудитора. */
    verdict: text('verdict').notNull(),
    note: text('note'),
    /** Номер раунда оценки по этой цели (растёт при каждой новой оценке). */
    round: integer('round').notNull().default(1),
    ...timestamps,
  },
  (table) => [index('auditor_assessment_target_idx').on(table.targetType, table.targetId)],
);

/**
 * T-114: request list (PBC — provided-by-client). Аудитор запрашивает у клиента
 * доказательство; auditee прикладывает документ; аудитор принимает.
 * requested → provided (документ приложен) → accepted (аудитор принял).
 */
export const evidenceRequest = pgTable(
  'evidence_request',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagement.id),
    title: text('title').notNull(),
    description: text('description'),
    /** Аудитор, создавший запрос. */
    requestedByMembershipId: uuid('requested_by_membership_id')
      .notNull()
      .references(() => membership.id),
    /** Auditee, который должен предоставить (опционально). */
    assigneeMembershipId: uuid('assignee_membership_id').references(() => membership.id),
    /** Приложенный документ-доказательство (после provide). */
    documentId: uuid('document_id').references(() => document.id),
    status: text('status').notNull().default('requested'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('evidence_request_engagement_idx').on(table.engagementId)],
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
    /** T-V22: категория библиотеки тестов — hr | it | automated. */
    category: text('category'),
    /** T-050: коннектор-источник для автотеста (FK в SQL — connector определён ниже). */
    connectorId: uuid('connector_id'),
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

/**
 * Connector — интеграция с внешней/локальной системой (T-048, ADR-0011).
 * capabilities: access/inventory/personnel/evidence/vulns/tasks. config_encrypted —
 * креды AES-256-GCM (в API наружу не отдаётся). Провайдеры за абстракцией (EP-INT).
 */
export const connector = pgTable(
  'connector',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    provider: text('provider').notNull(),
    capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
    configEncrypted: text('config_encrypted'),
    status: text('status').notNull().default('active'),
    /** T-V38: интервал автосинка в минутах (null/0 = только ручной запуск). */
    syncIntervalMinutes: integer('sync_interval_minutes'),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('connector_tenant_idx').on(table.tenantId)],
);

/** Прогон синхронизации коннектора (ADR-0011): история, метрики, ошибки. */
export const syncRun = pgTable(
  'sync_run',
  {
    id: id(),
    connectorId: uuid('connector_id')
      .notNull()
      .references(() => connector.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    outcome: text('outcome').notNull().default('running'),
    stats: jsonb('stats').notNull().default({}),
    error: text('error'),
    ...timestamps,
  },
  (table) => [index('sync_run_connector_idx').on(table.connectorId, table.startedAt)],
);

/**
 * Политика (T-051, B4, data-model §6): title_i18n, owner/approver, renew_by (cadence),
 * маппинг на фреймворки. Версии — policy_version (approved-версия фиксируется T-052).
 */
export const policy = pgTable(
  'policy',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    titleI18n: jsonb('title_i18n').$type<I18nText>().notNull(),
    ownerMembershipId: uuid('owner_membership_id').references(() => membership.id),
    approverMembershipId: uuid('approver_membership_id').references(() => membership.id),
    renewBy: timestamp('renew_by', { withTimezone: true }),
    /** T-V04: дедуп напоминания о продлении (одно письмо на срок, как finding.reminder_sent_at). */
    renewalReminderSentAt: timestamp('renewal_reminder_sent_at', { withTimezone: true }),
    status: text('status').notNull().default('draft'),
    frameworkIds: jsonb('framework_ids').$type<string[]>().notNull().default([]),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('policy_tenant_idx').on(table.tenantId)],
);

/** Версия политики (data-model §6): документ-содержимое (T-034), changelog, факт утверждения. */
export const policyVersion = pgTable(
  'policy_version',
  {
    id: id(),
    policyId: uuid('policy_id')
      .notNull()
      .references(() => policy.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    documentId: uuid('document_id').references(() => document.id),
    changelog: text('changelog'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: uuid('approved_by').references(() => membership.id),
    ...timestamps,
  },
  (table) => [uniqueIndex('policy_version_idx').on(table.policyId, table.version)],
);

/** Attestation (T-053, B4): сотрудник подтверждает ознакомление с approved-версией политики. */
export const policyAttestation = pgTable(
  'policy_attestation',
  {
    id: id(),
    policyVersionId: uuid('policy_version_id')
      .notNull()
      .references(() => policyVersion.id, { onDelete: 'cascade' }),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => membership.id),
    attestedAt: timestamp('attested_at', { withTimezone: true }),
    status: text('status').notNull().default('pending'),
    ...timestamps,
  },
  (table) => [uniqueIndex('policy_attestation_idx').on(table.policyVersionId, table.membershipId)],
);

/**
 * Account — идентичность в целевой системе (T-054, ADR-0012): AD-запись, AWS IAM…
 * Импортируется коннектором (EP-INT) или заводится вручную. Аккаунты без owner/MFA —
 * кандидаты в failing entities автотестов.
 */
export const account = pgTable(
  'account',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    subsidiaryId: uuid('subsidiary_id').references(() => subsidiary.id),
    connectorId: uuid('connector_id'),
    identifier: text('identifier').notNull(),
    displayName: text('display_name'),
    ownerMembershipId: uuid('owner_membership_id').references(() => membership.id),
    groups: jsonb('groups').$type<string[]>().notNull().default([]),
    type: text('type').notNull().default('human'),
    mfaEnabled: boolean('mfa_enabled'),
    status: text('status').notNull().default('active'),
    createdInSource: timestamp('created_in_source', { withTimezone: true }),
    deactivatedInSource: timestamp('deactivated_in_source', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('account_tenant_idx').on(table.tenantId),
    uniqueIndex('account_source_idx').on(table.tenantId, table.connectorId, table.identifier),
  ],
);

/** Access Review — кампания UAR (T-055, ADR-0012): периодическая сверка «кто к чему имеет доступ». */
export const accessReview = pgTable(
  'access_review',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    title: text('title').notNull(),
    period: text('period'),
    scope: jsonb('scope').notNull().default({}),
    status: text('status').notNull().default('in_progress'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('access_review_tenant_idx').on(table.tenantId)],
);

/** Пункт ревью (ADR-0012): решение по аккаунту — certify/revoke/modify; revoke может порождать finding. */
export const accessReviewItem = pgTable(
  'access_review_item',
  {
    id: id(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => accessReview.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id),
    reviewerMembershipId: uuid('reviewer_membership_id').references(() => membership.id),
    decision: text('decision'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    findingId: uuid('finding_id'),
    ...timestamps,
  },
  (table) => [uniqueIndex('access_review_item_idx').on(table.reviewId, table.accountId)],
);

/** Access request (T-056, ADR-0012): запрос доступа с approver-workflow (в т.ч. JIT). */
export const accessRequest = pgTable(
  'access_request',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    requesterMembershipId: uuid('requester_membership_id')
      .notNull()
      .references(() => membership.id),
    system: text('system').notNull(),
    justification: text('justification'),
    status: text('status').notNull().default('pending'),
    approverMembershipId: uuid('approver_membership_id').references(() => membership.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('access_request_tenant_idx').on(table.tenantId)],
);

/** Deprovisioning task (T-056, ADR-0012): отзыв доступа уволенного; SLA считается джобой T-043. */
export const deprovisioningTask = pgTable(
  'deprovisioning_task',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id),
    reason: text('reason'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    slaStatus: text('sla_status').notNull().default('ok'),
    status: text('status').notNull().default('open'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('deprovisioning_task_tenant_idx').on(table.tenantId)],
);

/** Конфиг матрицы рисков (T-057, RSK-02): шкалы и пороги классов на тенант; дефолт 5×5. */
export const riskMatrixConfig = pgTable(
  'risk_matrix_config',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    impactScale: integer('impact_scale').notNull().default(5),
    likelihoodScale: integer('likelihood_scale').notNull().default(5),
    /** Пороги классов по произведению impact×likelihood: {medium, high, critical}. */
    thresholds: jsonb('thresholds')
      .$type<{ medium: number; high: number; critical: number }>()
      .notNull(),
    weights: jsonb('weights').notNull().default({}),
    ...timestamps,
  },
  (table) => [uniqueIndex('risk_matrix_config_tenant_idx').on(table.tenantId)],
);

/**
 * Risk — реестр рисков (T-057, B6): скоринг по матрице (risk_class computed),
 * treatment, owner/approver. Связь с контролями — risk_control (T-058, RCM).
 */
export const risk = pgTable(
  'risk',
  {
    id: id(),
    /** T-V23: NULL — глобальная библиотека risk-сценариев (ADR-0016 global+override). */
    tenantId: uuid('tenant_id').references(() => tenant.id),
    subsidiaryId: uuid('subsidiary_id').references(() => subsidiary.id),
    domain: text('domain'),
    titleI18n: jsonb('title_i18n').$type<I18nText>().notNull(),
    descriptionI18n: jsonb('description_i18n').$type<I18nText>(),
    category: text('category'),
    inherentImpact: integer('inherent_impact'),
    inherentLikelihood: integer('inherent_likelihood'),
    residualImpact: integer('residual_impact'),
    residualLikelihood: integer('residual_likelihood'),
    riskClass: text('risk_class'),
    residualClass: text('residual_class'),
    treatment: text('treatment'),
    ownerMembershipId: uuid('owner_membership_id').references(() => membership.id),
    approverMembershipId: uuid('approver_membership_id').references(() => membership.id),
    /** T-V57: workflow согласования риска (null — не отправлен; pending/approved/rejected). */
    approvalStatus: text('approval_status'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    status: text('status').notNull().default('open'),
    sourceRiskId: uuid('source_risk_id').references((): AnyPgColumn => risk.id),
    custom: jsonb('custom').notNull().default({}),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('risk_tenant_idx').on(table.tenantId)],
);

/** RCM (T-058, CTL-02): M:N риск↔митигирующий контроль. Изоляция через risk (FORCE). */
export const riskControl = pgTable(
  'risk_control',
  {
    id: id(),
    riskId: uuid('risk_id')
      .notNull()
      .references(() => risk.id, { onDelete: 'cascade' }),
    controlId: uuid('control_id')
      .notNull()
      .references(() => control.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [uniqueIndex('risk_control_pair_idx').on(table.riskId, table.controlId)],
);

/**
 * Risk assessment — сессия оценки рисков (T-059, RSK-01): период, методология,
 * охват (scope jsonb: риски/дочки), статус. Документы — через document_link (T-034).
 */
export const riskAssessment = pgTable(
  'risk_assessment',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    title: text('title').notNull(),
    period: text('period'),
    methodologyNote: text('methodology_note'),
    scope: jsonb('scope').notNull().default({}),
    status: text('status').notNull().default('draft'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('risk_assessment_tenant_idx').on(table.tenantId)],
);

/** Vendor — поставщик (T-060, B5): риск-класс, lifecycle procurement→active→archived. */
export const vendor = pgTable(
  'vendor',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    subsidiaryId: uuid('subsidiary_id').references(() => subsidiary.id),
    name: text('name').notNull(),
    category: text('category'),
    url: text('url'),
    inherentRisk: text('inherent_risk'),
    residualRisk: text('residual_risk'),
    securityOwnerMembershipId: uuid('security_owner_membership_id').references(() => membership.id),
    status: text('status').notNull().default('procurement'),
    intake: jsonb('intake').notNull().default({}),
    custom: jsonb('custom').notNull().default({}),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('vendor_tenant_idx').on(table.tenantId)],
);

/** Vendor assessment (T-061): оценка вендора — тип, состояние, evidence. */
export const vendorAssessment = pgTable(
  'vendor_assessment',
  {
    id: id(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendor.id, { onDelete: 'cascade' }),
    type: text('type'),
    state: text('state').notNull().default('requested'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    ownerMembershipId: uuid('owner_membership_id').references(() => membership.id),
    recommendation: text('recommendation'),
    evidenceStatus: text('evidence_status').notNull().default('pending'),
    ...timestamps,
  },
  (table) => [index('vendor_assessment_vendor_idx').on(table.vendorId)],
);

/** Vulnerability (T-062, B13): уязвимость; импорт коннектором или вручную; SLA на due_date. */
export const vulnerability = pgTable(
  'vulnerability',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    accountId: uuid('account_id'),
    connectorId: uuid('connector_id'),
    /** T-V32: связь уязвимость↔актив для группировки и Asset SLA status. */
    assetId: uuid('asset_id').references((): AnyPgColumn => asset.id),
    cve: text('cve'),
    title: text('title').notNull(),
    description: text('description'),
    severity: text('severity').notNull().default('medium'),
    status: text('status').notNull().default('open'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    slaStatus: text('sla_status').notNull().default('ok'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('vulnerability_tenant_idx').on(table.tenantId),
    index('vulnerability_asset_idx').on(table.assetId),
  ],
);

/** Change management (T-063, B13): изменение с approval-workflow requested→approved→deployed. */
export const codeChange = pgTable(
  'code_change',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    title: text('title').notNull(),
    type: text('type'),
    risk: text('risk'),
    status: text('status').notNull().default('requested'),
    /** T-V40: затронутый актив/система (привязка к реестру). */
    assetId: uuid('asset_id').references(() => asset.id),
    requesterMembershipId: uuid('requester_membership_id').references(() => membership.id),
    approverMembershipId: uuid('approver_membership_id').references(() => membership.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    deployedAt: timestamp('deployed_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('code_change_tenant_idx').on(table.tenantId)],
);

/** Security-опросник (T-083, EP-QA): набор вопросов с ответами (вручную или reuse из KB). */
export const questionnaire = pgTable(
  'questionnaire',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    title: text('title').notNull(),
    source: text('source'),
    status: text('status').notNull().default('draft'),
    ownerMembershipId: uuid('owner_membership_id').references(() => membership.id),
    dueDate: timestamp('due_date', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('questionnaire_tenant_idx').on(table.tenantId)],
);

/** Ответ опросника (T-083): вручную или переиспользован из kb_entry. */
export const questionnaireAnswer = pgTable(
  'questionnaire_answer',
  {
    id: id(),
    questionnaireId: uuid('questionnaire_id')
      .notNull()
      .references(() => questionnaire.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    answer: text('answer'),
    kbEntryId: uuid('kb_entry_id').references(() => kbEntry.id),
    status: text('status').notNull().default('pending'),
    ...timestamps,
  },
  (table) => [index('questionnaire_answer_q_idx').on(table.questionnaireId)],
);

/** Аллокация ресурса на аудит (T-102, EP-SCHED, SCH-02): часы члена на engagement. */
export const resourceAllocation = pgTable(
  'resource_allocation',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagement.id, { onDelete: 'cascade' }),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => membership.id),
    allocatedHours: numeric('allocated_hours', { precision: 8, scale: 2 }).notNull(),
    period: text('period'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('resource_allocation_member_idx').on(table.membershipId)],
);

/** Годовой план аудитов (T-100, EP-PLAN, UNI-03): risk-based приоритизация + capacity. */
export const annualPlan = pgTable(
  'annual_plan',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    name: text('name').notNull(),
    year: integer('year'),
    capacityHours: numeric('capacity_hours', { precision: 10, scale: 2 }),
    status: text('status').notNull().default('draft'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('annual_plan_tenant_idx').on(table.tenantId)],
);

/** Строка плана (T-100): узел universe с priority_score по риску + planned_hours. */
export const planItem = pgTable(
  'plan_item',
  {
    id: id(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => annualPlan.id, { onDelete: 'cascade' }),
    auditableEntityId: uuid('auditable_entity_id').references(() => auditableEntity.id),
    priorityScore: numeric('priority_score', { precision: 6, scale: 2 }).notNull().default('0'),
    scoreBreakdown: jsonb('score_breakdown').notNull().default({}),
    plannedHours: numeric('planned_hours', { precision: 8, scale: 2 }),
    plannedQuarter: text('planned_quarter'),
    recurrence: jsonb('recurrence'),
    ...timestamps,
  },
  (table) => [index('plan_item_plan_idx').on(table.planId)],
);

/** Satisfaction survey (T-097, ISS-06): оценка удовлетворённости аудитом 1-5. */
export const satisfactionSurvey = pgTable(
  'satisfaction_survey',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagement.id, { onDelete: 'cascade' }),
    respondentMembershipId: uuid('respondent_membership_id').references(() => membership.id),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [index('satisfaction_survey_engagement_idx').on(table.engagementId)],
);

/** In-app уведомление (T-096, GEN-04): сообщение из системы адресату. */
export const notification = pgTable(
  'notification',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    recipientMembershipId: uuid('recipient_membership_id')
      .notNull()
      .references(() => membership.id),
    type: text('type').notNull().default('info'),
    title: text('title').notNull(),
    body: text('body'),
    readAt: timestamp('read_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('notification_recipient_idx').on(table.recipientMembershipId)],
);

/** Термин глоссария (T-095, GEN-09): global-сид (tenant_id NULL) + кастом тенанта. */
export const glossaryTerm = pgTable(
  'glossary_term',
  {
    id: id(),
    tenantId: uuid('tenant_id').references(() => tenant.id),
    term: text('term').notNull(),
    definitionI18n: jsonb('definition_i18n').$type<I18nText>().notNull(),
    category: text('category'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex('glossary_term_tenant_term_idx').on(table.tenantId, table.term)],
);

/** Knowledge base (T-082, EP-QA): библиотека переиспользуемых Q&A для опросников. */
export const kbEntry = pgTable(
  'kb_entry',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    category: text('category'),
    tags: jsonb('tags').notNull().default([]),
    /** T-V43: владелец и срок годности KB-ответа (verified пока не истёк). */
    ownerMembershipId: uuid('owner_membership_id').references(() => membership.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** T-V54: опубликовать ответ как публичный FAQ в Trust Center (KB→Trust visibility). */
    trustVisible: boolean('trust_visible').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('kb_entry_tenant_idx').on(table.tenantId)],
);

/** Trust Center (T-080, B7): публичная страница постуры тенанта по slug. */
export const trustCenter = pgTable(
  'trust_center',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    intro: text('intro'),
    isPublic: boolean('is_public').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('trust_center_slug_idx').on(table.slug),
    index('trust_center_tenant_idx').on(table.tenantId),
  ],
);

/** Опубликованный элемент постуры (T-080): фреймворк/контроль/документ. */
export const trustCenterItem = pgTable(
  'trust_center_item',
  {
    id: id(),
    trustCenterId: uuid('trust_center_id')
      .notNull()
      .references(() => trustCenter.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    category: text('category').notNull(),
    published: boolean('published').notNull().default(true),
    ...timestamps,
  },
  (table) => [index('trust_center_item_tc_idx').on(table.trustCenterId)],
);

/** Публичный запрос доступа к деталям Trust Center (T-081). */
export const trustAccessRequest = pgTable(
  'trust_access_request',
  {
    id: id(),
    trustCenterId: uuid('trust_center_id')
      .notNull()
      .references(() => trustCenter.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    company: text('company'),
    message: text('message'),
    status: text('status').notNull().default('pending'),
    /** T-V30: токен доступа, выдаётся при approve — публичная granted-ссылка. */
    token: text('token'),
    ...timestamps,
  },
  (table) => [index('trust_access_request_tc_idx').on(table.trustCenterId)],
);

/** T-V30: лог активности Trust Center — просмотры, запросы, выдача доступа. */
export const trustActivity = pgTable(
  'trust_activity',
  {
    id: id(),
    trustCenterId: uuid('trust_center_id')
      .notNull()
      .references(() => trustCenter.id, { onDelete: 'cascade' }),
    /** view | access_request | access_granted | access_used */
    kind: text('kind').notNull(),
    detail: text('detail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('trust_activity_tc_idx').on(table.trustCenterId)],
);

/** Контрактное обязательство (T-077, EP-MISC): реестр commitments + SLA на due_date. */
export const commitment = pgTable(
  'commitment',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    title: text('title').notNull(),
    source: text('source'),
    description: text('description'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    reviewCadence: text('review_cadence'),
    ownerMembershipId: uuid('owner_membership_id').references(() => membership.id),
    /** T-V31: связь обязательства с контрактом. */
    contractId: uuid('contract_id').references((): AnyPgColumn => contract.id),
    status: text('status').notNull().default('met'),
    slaStatus: text('sla_status').notNull().default('ok'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('commitment_tenant_idx').on(table.tenantId)],
);

/** T-V31: контракт с контрагентом; commitments привязываются к контракту. */
export const contract = pgTable(
  'contract',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    name: text('name').notNull(),
    counterparty: text('counterparty'),
    status: text('status').notNull().default('active'),
    startDate: timestamp('start_date', { withTimezone: true }),
    endDate: timestamp('end_date', { withTimezone: true }),
    note: text('note'),
    ownerMembershipId: uuid('owner_membership_id').references(() => membership.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('contract_tenant_idx').on(table.tenantId)],
);

/** Тег (T-076, EP-MISC): полиморфная навеска на любую сущность через tag_link. */
export const tag = pgTable(
  'tag',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    name: text('name').notNull(),
    color: text('color'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('tag_tenant_idx').on(table.tenantId),
    uniqueIndex('tag_tenant_name_idx').on(table.tenantId, table.name),
  ],
);

/** Полиморфная привязка тега (T-076): tag ↔ (entity_type, entity_id). */
export const tagLink = pgTable(
  'tag_link',
  {
    id: id(),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tag.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('tag_link_triple_idx').on(table.tagId, table.entityType, table.entityId)],
);

/**
 * T-V48 (ADR-0021): per-entity ACL «Manage access». Полиморфный грант доступа
 * конкретному membership на конкретную сущность. Семантика additive-restrictive:
 * если у сущности есть ХОТЯ БЫ одна acl-строка — доступ ограничен (только гранты
 * + владелец + админ); нет строк — сущность видна всему тенанту (текущее поведение).
 */
export const entityAcl = pgTable(
  'entity_acl',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => membership.id, { onDelete: 'cascade' }),
    /** view | edit — уровень предоставленного доступа. */
    level: text('level').notNull().default('view'),
    ...timestamps,
  },
  (table) => [
    index('entity_acl_entity_idx').on(table.entityType, table.entityId),
    uniqueIndex('entity_acl_triple_idx').on(table.entityType, table.entityId, table.membershipId),
  ],
);

/** Аудиторская фирма (T-V29): реестр внешних аудиторов, приглашаемых в тенант. */
export const auditFirm = pgTable(
  'audit_firm',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    name: text('name').notNull(),
    contactEmail: text('contact_email'),
    note: text('note'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('audit_firm_tenant_idx').on(table.tenantId)],
);

/**
 * Evidence review (T-V29): полиморфный статус ревью доказательства аудитором —
 * (entity_type, entity_id) → not_ready|ready|flagged|accepted + заметка.
 */
export const evidenceReview = pgTable(
  'evidence_review',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    status: text('status').notNull().default('not_ready'),
    note: text('note'),
    reviewedByMembershipId: uuid('reviewed_by_membership_id').references(() => membership.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('evidence_review_entity_idx').on(table.tenantId, table.entityType, table.entityId),
  ],
);

/**
 * Задача ремедиации (T-V27): полиморфная (entity_type, entity_id) —
 * finding/risk/control/vendor и т.п. Декомпозиция ремедиации на шаги с
 * assignee/due/status (open|in_progress|done).
 */
export const task = pgTable(
  'task',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    title: text('title').notNull(),
    status: text('status').notNull().default('open'),
    assigneeMembershipId: uuid('assignee_membership_id').references(() => membership.id),
    dueDate: timestamp('due_date', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('task_entity_idx').on(table.tenantId, table.entityType, table.entityId)],
);

/** ROPA — операция обработки ПДн (T-074, GDPR Art. 30, EP-PRIV). */
export const processingActivity = pgTable(
  'processing_activity',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    nameI18n: jsonb('name_i18n').$type<I18nText>().notNull(),
    purpose: text('purpose'),
    legalBasis: text('legal_basis').notNull(),
    role: text('role').notNull().default('controller'),
    dataCategories: jsonb('data_categories').notNull().default([]),
    dataSubjects: jsonb('data_subjects').notNull().default([]),
    recipients: jsonb('recipients').notNull().default([]),
    retentionPeriod: text('retention_period'),
    crossBorder: boolean('cross_border').notNull().default(false),
    ownerMembershipId: uuid('owner_membership_id').references(() => membership.id),
    /** T-V41: связь ROPA с вендором-получателем/процессором. */
    vendorId: uuid('vendor_id').references(() => vendor.id),
    /** T-V41: локации хранения данных (jsonb-массив строк). */
    dataLocations: jsonb('data_locations').notNull().default([]),
    /** T-V41: owner и дата пересмотра ROPA. */
    reviewOwnerMembershipId: uuid('review_owner_membership_id').references(() => membership.id),
    reviewDate: timestamp('review_date', { withTimezone: true }),
    status: text('status').notNull().default('active'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('processing_activity_tenant_idx').on(table.tenantId)],
);

/** DPIA — оценка влияния на защиту данных (T-075, EP-PRIV): workflow + документы через document_link. */
export const privacyAssessment = pgTable(
  'privacy_assessment',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    processingActivityId: uuid('processing_activity_id')
      .notNull()
      .references(() => processingActivity.id),
    title: text('title').notNull(),
    riskLevel: text('risk_level').notNull().default('medium'),
    necessityNote: text('necessity_note'),
    mitigations: jsonb('mitigations').notNull().default([]),
    status: text('status').notNull().default('draft'),
    /** T-V41: DPIA approval-workflow — approver + факт/дата. */
    approverMembershipId: uuid('approver_membership_id').references(() => membership.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    reviewDate: timestamp('review_date', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('privacy_assessment_tenant_idx').on(table.tenantId)],
);

/** Audit program (T-093, ENG-04/05): шаблон (engagement_id NULL) или инстанс + roll-forward. */
export const auditProgram = pgTable(
  'audit_program',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    engagementId: uuid('engagement_id').references(() => engagement.id),
    originProgramId: uuid('origin_program_id'),
    subjectArea: text('subject_area'),
    titleI18n: jsonb('title_i18n').$type<I18nText>().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('audit_program_tenant_idx').on(table.tenantId)],
);

/** Шаг audit program (T-093): процедура fieldwork. */
export const programStep = pgTable(
  'program_step',
  {
    id: id(),
    programId: uuid('program_id')
      .notNull()
      .references(() => auditProgram.id, { onDelete: 'cascade' }),
    order: integer('order').notNull().default(0),
    titleI18n: jsonb('title_i18n').$type<I18nText>().notNull(),
    instructionsI18n: jsonb('instructions_i18n').$type<I18nText>(),
    status: text('status').notNull().default('pending'),
    ...timestamps,
  },
  (table) => [index('program_step_program_idx').on(table.programId)],
);

/** KPI контроля (T-106, CTL-04, подмножество EP-LOWCODE): измеримая метрика эффективности. */
export const controlKpi = pgTable(
  'control_kpi',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    controlId: uuid('control_id')
      .notNull()
      .references(() => control.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    unit: text('unit'),
    targetValue: numeric('target_value', { precision: 12, scale: 2 }),
    currentValue: numeric('current_value', { precision: 12, scale: 2 }),
    direction: text('direction').notNull().default('higher_better'),
    period: text('period'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('control_kpi_control_idx').on(table.controlId)],
);

/** Working paper (T-092, EP-WPAPERS, WP-02): контейнер fieldwork с sign-off preparer≠reviewer. */
export const workingPaper = pgTable(
  'working_paper',
  {
    id: id(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagement.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    content: jsonb('content').notNull().default({}),
    status: text('status').notNull().default('draft'),
    preparerMembershipId: uuid('preparer_membership_id').references(() => membership.id),
    reviewerMembershipId: uuid('reviewer_membership_id').references(() => membership.id),
    editedSinceReview: boolean('edited_since_review').notNull().default(false),
    custom: jsonb('custom').notNull().default({}),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('working_paper_engagement_idx').on(table.engagementId)],
);

/**
 * Аннотации рабочего документа (EP-ANNOT buildable-срез, T-H19, WP-06/WP-09): комментарии,
 * tick-marks и exception'ы как ДАННЫЕ с текстовым якорем (section/paragraph). In-app
 * Office/PDF-рендерер, позиционирующий их визуально, — остаётся [!] (ADR-0017).
 */
export const wpAnnotation = pgTable(
  'wp_annotation',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    workingPaperId: uuid('working_paper_id')
      .notNull()
      .references(() => workingPaper.id, { onDelete: 'cascade' }),
    /** comment | tick_mark | exception (WP-09). */
    kind: text('kind').notNull().default('comment'),
    /** Текстовый якорь: секция/абзац/цитата, к чему относится (не пиксельная позиция). */
    anchor: text('anchor'),
    body: text('body').notNull(),
    authorMembershipId: uuid('author_membership_id').references(() => membership.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('wp_annotation_wp_idx').on(table.workingPaperId)],
);

/**
 * Per-tenant выбор LLM-провайдера (EP-AI, T-H23): клиент сам выбирает ИИ (Claude/GPT/Kimi/
 * локальная) вместо деплой-дефолта из env. Одна строка на тенант. Ключ провайдера —
 * зашифрован (AES-256-GCM, connectors/config-crypto), никогда не отдаётся наружу.
 */
export const tenantAiConfig = pgTable('tenant_ai_config', {
  id: id(),
  tenantId: uuid('tenant_id')
    .notNull()
    .unique()
    .references(() => tenant.id, { onDelete: 'cascade' }),
  /** none | anthropic | openai_compat. */
  provider: text('provider').notNull().default('none'),
  /** openai_compat: endpoint с /v1; anthropic: опц. прокси. */
  baseUrl: text('base_url'),
  model: text('model'),
  /** {apiKey} зашифрованный (encryptConfig); null = ключ не задан. */
  apiKeyEncrypted: text('api_key_encrypted'),
  /** T-V36b: AI Memory — контекст тенанта, подмешивается в system-промпт. */
  memory: text('memory'),
  ...timestamps,
});

/** Атрибутируемая подпись WP (T-092, WP-07): кто и в какой роли подписал. */
export const signOff = pgTable(
  'sign_off',
  {
    id: id(),
    workingPaperId: uuid('working_paper_id')
      .notNull()
      .references(() => workingPaper.id, { onDelete: 'cascade' }),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => membership.id),
    role: text('role').notNull(),
    note: text('note'),
    signedAt: timestamp('signed_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [index('sign_off_wp_idx').on(table.workingPaperId)],
);

/** API-ключ (T-090, EP-API, INT-01): программный bearer-доступ. В БД — только SHA-256 хэш. */
export const apiKey = pgTable(
  'api_key',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull(),
    prefix: text('prefix').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('api_key_hash_idx').on(table.keyHash),
    index('api_key_tenant_idx').on(table.tenantId),
  ],
);

/** Тайм-запись (T-088, EP-TIME, TIME-01): часы по аудиту/фазе/категории. */
export const timeEntry = pgTable(
  'time_entry',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => membership.id),
    engagementId: uuid('engagement_id').references(() => engagement.id),
    date: timestamp('date', { withTimezone: true }).notNull(),
    hours: numeric('hours', { precision: 6, scale: 2 }).notNull(),
    phase: text('phase'),
    category: text('category').notNull().default('audit'),
    billableRate: numeric('billable_rate', { precision: 10, scale: 2 }),
    note: text('note'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('time_entry_tenant_idx').on(table.tenantId),
    index('time_entry_engagement_idx').on(table.engagementId),
  ],
);

/** Настраиваемый список тенанта (T-087, GEN-06/ENG-09): audit_opinion и др. lookup'ы. */
export const configList = pgTable(
  'config_list',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    listKey: text('list_key').notNull(),
    items: jsonb('items').notNull().default([]),
    /** TEC-03 (T-H02): история версий — снимки прошлых items при каждом set. */
    history: jsonb('history')
      .$type<Array<{ items: unknown; at: string; by: string }>>()
      .notNull()
      .default([]),
    ...timestamps,
  },
  (table) => [uniqueIndex('config_list_key_idx').on(table.tenantId, table.listKey)],
);

/** Определение custom-поля (T-086, GEN-07): тенант описывает доп. поля per entity_type без кода. */
export const customFieldDef = pgTable(
  'custom_field_def',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    entityType: text('entity_type').notNull(),
    key: text('key').notNull(),
    labelI18n: jsonb('label_i18n').$type<I18nText>().notNull(),
    fieldType: text('field_type').notNull(),
    options: jsonb('options').notNull().default([]),
    required: boolean('required').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('custom_field_def_key_idx').on(table.tenantId, table.entityType, table.key),
  ],
);

/** Типо-специфичный шаблон пункта чеклиста (T-085, UNI-06): заготовка per audit_type. */
export const auditTypeTemplateItem = pgTable(
  'audit_type_template_item',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    auditTypeId: uuid('audit_type_id')
      .notNull()
      .references(() => auditType.id),
    ref: text('ref').notNull(),
    objectiveI18n: jsonb('objective_i18n').$type<I18nText>().notNull(),
    questionI18n: jsonb('question_i18n').$type<I18nText>().notNull(),
    order: integer('order').notNull().default(0),
    ...timestamps,
  },
  (table) => [index('audit_type_template_item_tenant_idx').on(table.tenantId, table.auditTypeId)],
);

/** Настраиваемый чарт-дашборд (T-072, B9): widgets jsonb — список {metric, chartType, title}. */
export const dashboard = pgTable(
  'dashboard',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    name: text('name').notNull(),
    widgets: jsonb('widgets').notNull().default([]),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('dashboard_tenant_idx').on(table.tenantId)],
);

/** Снапшот метрик на дату (T-073, B10): заморозка состояния для доказуемости «как было». */
export const reportSnapshot = pgTable(
  'report_snapshot',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    label: text('label').notNull(),
    metrics: jsonb('metrics').notNull().default({}),
    /** T-V34: замороженный состав открытых findings/vulnerabilities на дату. */
    composition: jsonb('composition').notNull().default({}),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [index('report_snapshot_tenant_idx').on(table.tenantId)],
);

/**
 * Инцидент ИБ (T-IR01, ADR-0024): разбирательство над одним или несколькими сигналами.
 * Отличается от security_alert (один сигнал) и finding (несоответствие внутри аудита).
 */
export const incident = pgTable(
  'incident',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    /** Человекочитаемый номер INC-0001, сквозной в пределах тенанта. */
    ref: text('ref').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    /** Та же шкала, что у алертов/уязвимостей — работают окна sla_config. */
    severity: text('severity').notNull().default('medium'),
    /** detected→triaged→contained→eradicated→recovered→closed (ADR-0024). */
    status: text('status').notNull().default('detected'),
    category: text('category'),
    /** Откуда пришёл: manual | alert | connector. */
    source: text('source').notNull().default('manual'),
    /** Метки фаз — из них считаются MTTD/MTTR (T-IR07). */
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
    triagedAt: timestamp('triaged_at', { withTimezone: true }),
    containedAt: timestamp('contained_at', { withTimezone: true }),
    eradicatedAt: timestamp('eradicated_at', { withTimezone: true }),
    recoveredAt: timestamp('recovered_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    /** Incident commander — ведущий разбирательство (T-IR03). */
    commanderMembershipId: uuid('commander_membership_id').references(() => membership.id),
    /** Resolution SLA по окну severity тенанта (как T-V40 у алертов). */
    dueDate: timestamp('due_date', { withTimezone: true }),
    slaStatus: text('sla_status').notNull().default('ok'),
    custom: jsonb('custom').notNull().default({}),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('incident_tenant_idx').on(table.tenantId),
    uniqueIndex('incident_tenant_ref_uq').on(table.tenantId, table.ref),
  ],
);

/**
 * Таймлайн инцидента (T-IR01): append-only хронология — единственный источник для постмортема.
 * kind: status_change | note | action | notification.
 */
export const incidentEvent = pgTable(
  'incident_event',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => incident.id),
    kind: text('kind').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    note: text('note'),
    /** Автор записи; NULL — системное событие (джоба, коннектор). */
    authorMembershipId: uuid('author_membership_id').references(() => membership.id),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    index('incident_event_tenant_idx').on(table.tenantId),
    index('incident_event_incident_idx').on(table.incidentId),
  ],
);

/**
 * Связи инцидента с любой сущностью платформы (T-IR02): сигналы, которые в него вошли,
 * затронутые активы, риски/контроли, поставщик, порождённые findings.
 * Пара entity_type+entity_id вместо FK-зоопарка (ADR-0024).
 */
export const incidentLink = pgTable(
  'incident_link',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => incident.id),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    note: text('note'),
    ...timestamps,
  },
  (table) => [
    index('incident_link_tenant_idx').on(table.tenantId),
    index('incident_link_incident_idx').on(table.incidentId),
    uniqueIndex('incident_link_uq').on(table.incidentId, table.entityType, table.entityId),
  ],
);

/** Security alert (T-064): сигнал из коннектора/сканера → triage → закрытие. */
export const securityAlert = pgTable(
  'security_alert',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    title: text('title').notNull(),
    source: text('source'),
    severity: text('severity').notNull().default('medium'),
    status: text('status').notNull().default('new'),
    /** T-V40: категория алерта (malware/phishing/vulnerability/misconfig/access/other). */
    category: text('category'),
    /** T-V40: затронутый актив (привязка к реестру). */
    assetId: uuid('asset_id').references(() => asset.id),
    /** T-V40: resolution SLA — дедлайн закрытия по окну severity + статус (recalc-джоба). */
    dueDate: timestamp('due_date', { withTimezone: true }),
    slaStatus: text('sla_status').notNull().default('ok'),
    triageNote: text('triage_note'),
    connectorId: uuid('connector_id').references(() => connector.id),
    triagedAt: timestamp('triaged_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('security_alert_tenant_idx').on(table.tenantId)],
);

/**
 * Узел audit universe (T-065, UNI-01): umbrella-дерево неограниченной глубины.
 * kind + ref_id проецируют специализированные сущности (subsidiary/process/asset).
 */
export const auditableEntity = pgTable(
  'auditable_entity',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    parentId: uuid('parent_id'),
    kind: text('kind').notNull(),
    refId: uuid('ref_id'),
    nameI18n: jsonb('name_i18n').$type<I18nText>().notNull(),
    descriptionI18n: jsonb('description_i18n').$type<I18nText>(),
    ownerMembershipId: uuid('owner_membership_id').references(() => membership.id),
    custom: jsonb('custom').notNull().default({}),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('auditable_entity_tenant_idx').on(table.tenantId),
    index('auditable_entity_parent_idx').on(table.parentId),
  ],
);

/**
 * Профиль сотрудника (T-069, B6): standalone — сотрудник ≠ обязательно платформенный user.
 * Источник — HRIS/IdP-коннектор (personnel capability) или ручное заведение.
 */
export const personnelProfile = pgTable(
  'personnel_profile',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    membershipId: uuid('membership_id').references(() => membership.id),
    departmentId: uuid('department_id').references(() => department.id),
    externalId: text('external_id'),
    fullName: text('full_name').notNull(),
    email: text('email'),
    unit: text('unit'),
    position: text('position'),
    employmentStatus: text('employment_status').notNull().default('active'),
    hiredAt: timestamp('hired_at', { withTimezone: true }),
    contacts: jsonb('contacts').notNull().default({}),
    certificates: jsonb('certificates').notNull().default([]),
    connectorId: uuid('connector_id').references(() => connector.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('personnel_profile_tenant_idx').on(table.tenantId),
    uniqueIndex('personnel_profile_connector_external_idx').on(table.connectorId, table.externalId),
  ],
);

/**
 * Endpoint-устройство сотрудника (T-070, B12): MDM-проверки пароль/шифрование/антивирус/блокировка.
 * compliance_status вычисляется из проверок; non_compliant → failing entity автотеста (T-071).
 */
export const device = pgTable(
  'device',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    ownerPersonnelId: uuid('owner_personnel_id').references(() => personnelProfile.id),
    name: text('name').notNull(),
    os: text('os'),
    serial: text('serial'),
    diskEncryption: boolean('disk_encryption').notNull().default(false),
    screenLock: boolean('screen_lock').notNull().default(false),
    antivirus: boolean('antivirus').notNull().default(false),
    passwordPolicy: boolean('password_policy').notNull().default(false),
    complianceStatus: text('compliance_status').notNull().default('non_compliant'),
    source: text('source').notNull().default('manual'),
    connectorId: uuid('connector_id').references(() => connector.id),
    externalId: text('external_id'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('device_tenant_idx').on(table.tenantId),
    uniqueIndex('device_connector_external_idx').on(table.connectorId, table.externalId),
  ],
);

/** ИТ-актив (T-066): проецируется в universe (kind=system, ref_id=asset.id). connector_id — авто-обнаружение B3. */
export const asset = pgTable(
  'asset',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    subsidiaryId: uuid('subsidiary_id'),
    type: text('type').notNull(),
    name: text('name').notNull(),
    ownerMembershipId: uuid('owner_membership_id').references(() => membership.id),
    connectorId: uuid('connector_id').references(() => connector.id),
    externalId: text('external_id'),
    attrs: jsonb('attrs').notNull().default({}),
    custom: jsonb('custom').notNull().default({}),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('asset_tenant_idx').on(table.tenantId),
    uniqueIndex('asset_connector_external_idx').on(table.connectorId, table.externalId),
  ],
);

/**
 * Бизнес-процесс (T-067, ADR-0016 гибрид): subsidiary_id NULL = каталог группы, иначе локальный дочки.
 * Проецируется в universe (kind=process, ref_id=business_process.id).
 */
export const businessProcess = pgTable(
  'business_process',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    subsidiaryId: uuid('subsidiary_id'),
    nameI18n: jsonb('name_i18n').$type<I18nText>().notNull(),
    criticality: text('criticality').notNull().default('medium'),
    ownerMembershipId: uuid('owner_membership_id').references(() => membership.id),
    scoring: jsonb('scoring').notNull().default({}),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('business_process_tenant_idx').on(table.tenantId)],
);

/** M:N risk↔auditable_entity (T-066, отложено из EP-RISK): риск затрагивает узлы universe. */
export const riskEntity = pgTable(
  'risk_entity',
  {
    id: id(),
    riskId: uuid('risk_id')
      .notNull()
      .references(() => risk.id, { onDelete: 'cascade' }),
    auditableEntityId: uuid('auditable_entity_id')
      .notNull()
      .references(() => auditableEntity.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [uniqueIndex('risk_entity_pair_idx').on(table.riskId, table.auditableEntityId)],
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
