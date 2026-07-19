/**
 * Идемпотентный seed демо-данных (T-007). Запуск: `pnpm seed` из корня
 * (после `pnpm build` и `pnpm db:migrate`) — или `node dist/seed.js` из apps/api.
 *
 * Гарантирует S3-бакет с демо-файлом и сидит доменные данные (T-010+):
 * демо-tenant «demo» с одной дочкой. Растёт вместе со схемой.
 */
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Client } from 'pg';
import { Redis } from 'ioredis';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { env } from './env';
import {
  auditLog,
  auditType,
  glossaryTerm,
  comment,
  connector,
  control,
  controlDomain,
  controlMapping,
  department,
  fieldPermission,
  framework,
  frameworkRequirement,
  license,
  membership,
  permission,
  risk,
  role,
  rolePermission,
  subsidiary,
  tenant,
  test,
  user,
} from './db/schema';
import { PasswordService } from './auth/password.service';
import { CONTROL_DOMAINS, GLOBAL_CONTROLS } from './seed-data/global-controls';
import { GLOBAL_FRAMEWORKS } from './seed-data/global-frameworks';
import { RISK_LIBRARY } from './seed-data/risk-library';
import { encryptConfig } from './connectors/config-crypto';

const DEMO_OBJECT_KEY = 'demo/welcome.txt';
const DEMO_TENANT_SLUG = 'demo';

/** Глобальный каталог прав (T-018, без RLS): 5 ресурсов × 6 действий. Идемпотентно. */
export async function seedPermissionCatalog(db: NodePgDatabase) {
  const RESOURCES = ['engagement', 'finding', 'control', 'report', 'settings'];
  const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export'];
  await db
    .insert(permission)
    .values(RESOURCES.flatMap((resource) => ACTIONS.map((action) => ({ resource, action }))))
    .onConflictDoNothing();
  return db.select().from(permission);
}

async function seedPostgres(): Promise<void> {
  const client = new Client({ connectionString: env.databaseUrl, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const db = drizzle(client);

    await db
      .insert(tenant)
      .values({ slug: DEMO_TENANT_SLUG, name: 'Demo Group', languageDefault: 'en' })
      .onConflictDoNothing({ target: tenant.slug });
    const [demoTenant] = await db.select().from(tenant).where(eq(tenant.slug, DEMO_TENANT_SLUG));
    if (!demoTenant) throw new Error(`Tenant «${DEMO_TENANT_SLUG}» не найден после вставки`);
    console.log(`✓ Tenant «${demoTenant.name}» (${demoTenant.id})`);

    // subsidiary под RLS (T-011): любые чтения/записи — только с контекстом тенанта
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${demoTenant.id}, true)`);
      const existing = await tx
        .select()
        .from(subsidiary)
        .where(and(eq(subsidiary.tenantId, demoTenant.id), eq(subsidiary.code, 'demo-bank')));
      if (existing.length === 0) {
        await tx.insert(subsidiary).values({
          tenantId: demoTenant.id,
          code: 'demo-bank',
          nameI18n: { en: 'Demo Bank', az: 'Demo Bank', ru: 'Демо-банк' },
          country: 'AZ',
          businessProfile: { segment: 'banking' },
        });
      }
    });
    console.log('✓ Subsidiary «Demo Bank» (code: demo-bank)');

    // Лицензия demo-тенанта (T-026): маленькие лимиты, чтобы видеть мягкие предупреждения
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${demoTenant.id}, true)`);
      await tx
        .insert(license)
        .values({ tenantId: demoTenant.id, plan: 'demo', maxSubsidiaries: 2, maxAuditSeats: 5 })
        .onConflictDoNothing({ target: license.tenantId });
    });
    console.log('✓ Лицензия demo: план demo, 2 дочки, 5 audit-seats');

    // RBAC (T-018): глобальный каталог прав (без RLS) + демо-роль тенанта с матрицей
    const catalog = await seedPermissionCatalog(db);
    console.log(`✓ Каталог прав: ${catalog.length} permission'ов`);

    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${demoTenant.id}, true)`);
      const roles = await tx.select().from(role).where(eq(role.tenantId, demoTenant.id));
      if (roles.length === 0) {
        const [demoRole] = await tx
          .insert(role)
          .values({
            tenantId: demoTenant.id,
            nameI18n: { en: 'Demo Auditors', az: 'Demo Auditorlar', ru: 'Демо-аудиторы' },
          })
          .returning();
        if (!demoRole) throw new Error('Демо-роль не создалась');
        await tx.insert(rolePermission).values(
          catalog.map((p) => ({
            roleId: demoRole.id,
            permissionId: p.id,
            level: ['engagement', 'finding'].includes(p.resource) ? 'edit' : 'view',
          })),
        );
      }
    });
    console.log('✓ Роль «Демо-аудиторы» с матрицей (edit: engagement/finding, view: остальное)');
    await seedPresetRoles(catalog);
    await seedDemoFieldPermissions();
    await seedGlobalFrameworks();
    await seedGlobalControls();
    await seedGlobalRiskLibrary();
    await seedAuditTypes();
    await seedGlossary();
    await seedDemoUsers(db, demoTenant.id);
    await seedDemoDepartments(db, demoTenant.id);
    await seedDemoControlAdaptation(db, demoTenant.id);
    await seedDemoConnector(db, demoTenant.id);
    await seedDemoAutoTest(db, demoTenant.id);
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Системные пресет-роли (T-019): tenant_id NULL — вставка обходит RLS-политику
 * записи, поэтому идёт под владельцем схемы (DATABASE_URL_OWNER), как миграции.
 * Категории membership (auditor/end user/MSP) появятся вместе с таблицей membership.
 */
const PRESET_ROLES: Array<{
  name: { en: string; az: string; ru: string };
  level: (resource: string, action: string) => 'none' | 'view' | 'edit';
}> = [
  { name: { en: 'Admin', az: 'Admin', ru: 'Администратор' }, level: () => 'edit' },
  {
    name: { en: 'View-only Admin', az: 'Baxış Admini', ru: 'Админ (только чтение)' },
    level: () => 'view',
  },
  {
    name: { en: 'Editor', az: 'Redaktor', ru: 'Редактор' },
    level: (resource) => (resource === 'settings' ? 'view' : 'edit'),
  },
  {
    name: { en: 'Collaborator', az: 'Əməkdaş', ru: 'Участник' },
    level: (resource) =>
      resource === 'finding' ? 'edit' : resource === 'settings' ? 'none' : 'view',
  },
  {
    name: { en: 'Assessor', az: 'Qiymətləndirici', ru: 'Ассессор' },
    level: (resource) =>
      ['engagement', 'finding'].includes(resource)
        ? 'edit'
        : resource === 'settings'
          ? 'none'
          : 'view',
  },
  {
    name: { en: 'Manager', az: 'Menecer', ru: 'Менеджер' },
    level: (resource) => (['engagement', 'finding', 'report'].includes(resource) ? 'edit' : 'view'),
  },
  {
    name: { en: 'Approver', az: 'Təsdiqləyici', ru: 'Утверждающий' },
    level: (resource, action) => (action === 'approve' ? 'edit' : 'view'),
  },
];

export async function seedPresetRoles(catalog: (typeof permission.$inferSelect)[]): Promise<void> {
  const owner = new Client({
    connectionString: env.databaseUrlOwner,
    connectionTimeoutMillis: 5000,
  });
  try {
    await owner.connect();
    const db = drizzle(owner);
    const existing = await db.select().from(role).where(eq(role.isSystem, true));
    const existingNames = new Set(existing.map((r) => r.nameI18n.en));
    for (const preset of PRESET_ROLES) {
      if (existingNames.has(preset.name.en)) continue;
      const [created] = await db
        .insert(role)
        .values({ tenantId: null, nameI18n: preset.name, isSystem: true })
        .returning();
      if (!created) throw new Error(`Пресет «${preset.name.en}» не создался`);
      await db.insert(rolePermission).values(
        catalog.map((p) => ({
          roleId: created.id,
          permissionId: p.id,
          level: preset.level(p.resource, p.action),
        })),
      );
    }
    console.log(`✓ Системные пресет-роли: ${PRESET_ROLES.length} (idempotent)`);
  } finally {
    await owner.end().catch(() => {});
  }
}

/** Демо-логины (T-020): admin@demo.io / Demo-Admin-2026 и collaborator@demo.io / Demo-Collab-2026. */
/** Приоритетные стандарты из ответов клиента (T-001) + местный регулятор CBAR (T-C01, назван клиентом). */

/**
 * Демо field-level права (SEC-04, T-H04/T-H06, ADR-0020). Под owner (глобальные
 * роли tenant_id NULL). Идемпотентно.
 * - Collaborator не видит recommendation у finding;
 * - Approver не видит email у персонала (privacy-контроль).
 */
async function seedDemoFieldPermissions(): Promise<void> {
  const DEMO: Array<{ roleEn: string; entityType: string; field: string }> = [
    { roleEn: 'Collaborator', entityType: 'finding', field: 'recommendation' },
    { roleEn: 'Approver', entityType: 'personnel', field: 'email' },
  ];
  const owner = new Client({
    connectionString: env.databaseUrlOwner,
    connectionTimeoutMillis: 5000,
  });
  try {
    await owner.connect();
    const db = drizzle(owner);
    const roles = await db.select().from(role).where(eq(role.isSystem, true));
    for (const d of DEMO) {
      const r = roles.find((x) => x.nameI18n.en === d.roleEn);
      if (!r) continue;
      const [existing] = await db
        .select()
        .from(fieldPermission)
        .where(
          and(
            eq(fieldPermission.roleId, r.id),
            eq(fieldPermission.entityType, d.entityType),
            eq(fieldPermission.field, d.field),
          ),
        );
      if (!existing) {
        await db
          .insert(fieldPermission)
          .values({ roleId: r.id, entityType: d.entityType, field: d.field, level: 'hidden' });
      }
    }
    console.log(
      '✓ Демо field-level: Collaborator↛finding.recommendation, Approver↛personnel.email (idempotent)',
    );
  } finally {
    await owner.end().catch(() => {});
  }
}

/** Глобальная библиотека (ADR-0016) — под owner: RLS-политика записи не пускает app к tenant_id NULL. */
export async function seedGlobalFrameworks(): Promise<void> {
  const owner = new Client({
    connectionString: env.databaseUrlOwner,
    connectionTimeoutMillis: 5000,
  });
  try {
    await owner.connect();
    const db = drizzle(owner);
    for (const fw of GLOBAL_FRAMEWORKS) {
      const [existing] = await db
        .select()
        .from(framework)
        .where(
          and(
            isNull(framework.tenantId),
            sql`${framework.nameI18n}->>'en' = ${fw.name.en}`,
            eq(framework.version, fw.version),
          ),
        );
      if (existing) {
        // T-V25: обновляем домен каталога у ранее посеянных фреймворков
        if (existing.domain !== fw.domain) {
          await db
            .update(framework)
            .set({ domain: fw.domain })
            .where(eq(framework.id, existing.id));
        }
        // T-V47: досев недостающих требований (уникальность по (framework_id, ref))
        const added = await db
          .insert(frameworkRequirement)
          .values(
            fw.requirements.map((r) => ({
              frameworkId: existing.id,
              ref: r.ref,
              titleI18n: r.title,
            })),
          )
          .onConflictDoNothing()
          .returning({ id: frameworkRequirement.id });
        if (added.length > 0) {
          console.log(`  + ${fw.name.en}: досеяно требований ${added.length}`);
        }
        continue;
      }
      const [created] = await db
        .insert(framework)
        .values({ tenantId: null, nameI18n: fw.name, version: fw.version, domain: fw.domain })
        .returning();
      if (!created) throw new Error(`Фреймворк «${fw.name.en}» не создался`);
      await db.insert(frameworkRequirement).values(
        fw.requirements.map((r) => ({
          frameworkId: created.id,
          ref: r.ref,
          titleI18n: r.title,
        })),
      );
    }
    console.log(`✓ Глобальная библиотека фреймворков: ${GLOBAL_FRAMEWORKS.length} (idempotent)`);
  } finally {
    await owner.end().catch(() => {});
  }
}

/** T-V23: глобальная библиотека risk-сценариев (tenant_id NULL) — под owner, как фреймворки. */
export async function seedGlobalRiskLibrary(): Promise<void> {
  const owner = new Client({
    connectionString: env.databaseUrlOwner,
    connectionTimeoutMillis: 5000,
  });
  try {
    await owner.connect();
    const db = drizzle(owner);
    const existing = await db
      .select({ titleI18n: risk.titleI18n })
      .from(risk)
      .where(isNull(risk.tenantId));
    const known = new Set(existing.map((r) => r.titleI18n.en));
    let added = 0;
    for (const item of RISK_LIBRARY) {
      if (known.has(item.title.en)) continue;
      await db.insert(risk).values({
        tenantId: null,
        titleI18n: item.title,
        descriptionI18n: item.description,
        category: item.category,
        inherentImpact: item.inherentImpact,
        inherentLikelihood: item.inherentLikelihood,
        status: 'library',
      });
      added += 1;
    }
    console.log(`✓ Библиотека risk-сценариев: ${RISK_LIBRARY.length} (новых ${added})`);
  } finally {
    await owner.end().catch(() => {});
  }
}

/** Демонстрационные маппинги Control↔Requirement (полный мультифреймворк-маппинг — EP-FWK). */
const DEMO_CONTROL_MAPPINGS: Array<{ control: string; framework: string; requirement: string }> = [
  { control: 'GOV-01', framework: 'ISO/IEC 27001', requirement: 'A.5.1' },
  { control: 'GOV-01', framework: 'COBIT', requirement: 'EDM01' },
  { control: 'GOV-02', framework: 'ISO/IEC 27001', requirement: 'A.5.2' },
  { control: 'GOV-02', framework: 'NIST CSF', requirement: 'GV.OC' },
  { control: 'EP-01', framework: 'ISO/IEC 27001', requirement: 'A.8.1' },
  { control: 'AM-01', framework: 'NIST CSF', requirement: 'ID.AM' },
];

/** Библиотека контролей из шаблона клиента (T-031) — под owner, как и фреймворки. */
export async function seedGlobalControls(): Promise<void> {
  const owner = new Client({
    connectionString: env.databaseUrlOwner,
    connectionTimeoutMillis: 5000,
  });
  try {
    await owner.connect();
    const db = drizzle(owner);

    const domainIds = new Map<string, string>();
    for (const d of CONTROL_DOMAINS) {
      const [existing] = await db
        .select()
        .from(controlDomain)
        .where(and(isNull(controlDomain.tenantId), eq(controlDomain.code, d.code)));
      if (existing) {
        domainIds.set(d.code, existing.id);
        continue;
      }
      const [created] = await db
        .insert(controlDomain)
        .values({ tenantId: null, code: d.code, nameI18n: d.name })
        .returning();
      if (!created) throw new Error(`Домен «${d.code}» не создался`);
      domainIds.set(d.code, created.id);
    }

    const controlIds = new Map<string, string>();
    for (const c of GLOBAL_CONTROLS) {
      const [existing] = await db
        .select()
        .from(control)
        .where(and(isNull(control.tenantId), eq(control.ref, c.ref)));
      if (existing) {
        controlIds.set(c.ref, existing.id);
        continue;
      }
      const domainId = domainIds.get(c.domain);
      if (!domainId) throw new Error(`Домен «${c.domain}» для контроля ${c.ref} не найден`);
      const [created] = await db
        .insert(control)
        .values({
          tenantId: null,
          ref: c.ref,
          domainId,
          objectiveI18n: c.objective,
          questionI18n: c.question,
        })
        .returning();
      if (!created) throw new Error(`Контроль «${c.ref}» не создался`);
      controlIds.set(c.ref, created.id);
    }

    for (const m of DEMO_CONTROL_MAPPINGS) {
      const controlId = controlIds.get(m.control);
      if (!controlId) continue;
      const [req] = await db
        .select({ id: frameworkRequirement.id })
        .from(frameworkRequirement)
        .innerJoin(framework, eq(frameworkRequirement.frameworkId, framework.id))
        .where(
          and(
            isNull(framework.tenantId),
            sql`${framework.nameI18n}->>'en' = ${m.framework}`,
            eq(frameworkRequirement.ref, m.requirement),
          ),
        );
      if (!req) continue;
      await db
        .insert(controlMapping)
        .values({ controlId, requirementId: req.id })
        .onConflictDoNothing();
    }

    // T-C01: авто-маппинг всех глобальных контролей на CBAR по домену
    // (ref CBAR-требования = код домена контроля) → покрытие местного регулятора.
    const cbarReqs = await db
      .select({ id: frameworkRequirement.id, ref: frameworkRequirement.ref })
      .from(frameworkRequirement)
      .innerJoin(framework, eq(frameworkRequirement.frameworkId, framework.id))
      .where(and(isNull(framework.tenantId), sql`${framework.nameI18n}->>'en' = 'CBAR IT Audit'`));
    const cbarByDomain = new Map(cbarReqs.map((r) => [r.ref, r.id]));
    for (const c of GLOBAL_CONTROLS) {
      const controlId = controlIds.get(c.ref);
      const reqId = cbarByDomain.get(c.domain);
      if (!controlId || !reqId) continue;
      await db
        .insert(controlMapping)
        .values({ controlId, requirementId: reqId })
        .onConflictDoNothing();
    }

    console.log(
      `✓ Библиотека контролей: ${CONTROL_DOMAINS.length} доменов, ${GLOBAL_CONTROLS.length} контролей, маппинги + CBAR-покрытие (idempotent)`,
    );
  } finally {
    await owner.end().catch(() => {});
  }
}

async function seedDemoUsers(db: NodePgDatabase, tenantId: string): Promise<void> {
  const passwordService = new PasswordService();
  const demoUsers = [
    {
      email: 'admin@demo.io',
      fullName: 'Demo Admin',
      password: 'Demo-Admin-2026',
      roleEn: 'Admin',
    },
    {
      email: 'collaborator@demo.io',
      fullName: 'Demo Collaborator',
      password: 'Demo-Collab-2026',
      roleEn: 'Collaborator',
    },
    {
      // T-052: approver политик — роль Approver (settings.view, но не settings.edit)
      email: 'approver@demo.io',
      fullName: 'Demo Approver',
      password: 'Demo-Approver-2026',
      roleEn: 'Approver',
    },
  ];
  const systemRoles = await db.select().from(role).where(eq(role.isSystem, true));
  for (const demo of demoUsers) {
    const presetRole = systemRoles.find((r) => r.nameI18n.en === demo.roleEn);
    if (!presetRole)
      throw new Error(`Пресет-роль «${demo.roleEn}» не найдена — сид ролей не прошёл?`);
    await db
      .insert(user)
      .values({
        email: demo.email,
        fullName: demo.fullName,
        passwordHash: await passwordService.hash(demo.password),
        passwordChangedAt: new Date(),
      })
      .onConflictDoNothing({ target: user.email });
    const [seededUser] = await db.select().from(user).where(eq(user.email, demo.email));
    if (!seededUser) throw new Error(`Демо-юзер ${demo.email} не найден после вставки`);
    await db
      .insert(membership)
      .values({ userId: seededUser.id, tenantId, roleId: presetRole.id, isAuditSeat: true })
      .onConflictDoNothing();
  }
  console.log(
    '✓ Демо-юзеры: admin@demo.io (Admin), collaborator@demo.io (Collaborator), approver@demo.io (Approver)',
  );
}

/** Типы аудита — lookup UNI-06 (data-model §4), глобальные. */
const AUDIT_TYPES = [
  { code: 'operational', name: { en: 'Operational', az: 'Əməliyyat', ru: 'Операционный' } },
  { code: 'financial', name: { en: 'Financial', az: 'Maliyyə', ru: 'Финансовый' } },
  { code: 'it', name: { en: 'IT', az: 'İT', ru: 'ИТ' } },
  { code: 'compliance', name: { en: 'Compliance', az: 'Uyğunluq', ru: 'Комплаенс' } },
  { code: 'quality', name: { en: 'Quality', az: 'Keyfiyyət', ru: 'Качество' } },
  { code: 'advisory', name: { en: 'Advisory', az: 'Məsləhət', ru: 'Консультационный' } },
  {
    code: 'investigations',
    name: { en: 'Investigations', az: 'Araşdırmalar', ru: 'Расследования' },
  },
];

export async function seedAuditTypes(): Promise<void> {
  const owner = new Client({
    connectionString: env.databaseUrlOwner,
    connectionTimeoutMillis: 5000,
  });
  try {
    await owner.connect();
    const db = drizzle(owner);
    for (const t of AUDIT_TYPES) {
      const [existing] = await db
        .select()
        .from(auditType)
        .where(and(isNull(auditType.tenantId), eq(auditType.code, t.code)));
      if (existing) continue;
      await db.insert(auditType).values({ tenantId: null, code: t.code, nameI18n: t.name });
    }
    console.log(`✓ Типы аудита: ${AUDIT_TYPES.length} (idempotent)`);
  } finally {
    await owner.end().catch(() => {});
  }
}

/** Базовые GRC-термины глоссария (T-095, GEN-09) — глобальные (tenant_id NULL). */
const GLOSSARY_TERMS = [
  {
    term: 'Control',
    category: 'core',
    definition: { en: 'A safeguard that mitigates risk.', ru: 'Мера, снижающая риск.' },
  },
  {
    term: 'Finding',
    category: 'core',
    definition: {
      en: 'An identified deficiency or exception.',
      ru: 'Выявленное несоответствие или отклонение.',
    },
  },
  {
    term: 'RCM',
    category: 'risk',
    definition: {
      en: 'Risk-Control Matrix: mapping of risks to mitigating controls.',
      ru: 'Матрица «риск-контроль»: связь рисков с митигирующими контролями.',
    },
  },
  {
    term: 'DPIA',
    category: 'privacy',
    definition: {
      en: 'Data Protection Impact Assessment.',
      ru: 'Оценка влияния на защиту данных.',
    },
  },
  {
    term: 'ROPA',
    category: 'privacy',
    definition: {
      en: 'Records of Processing Activities (GDPR Art. 30).',
      ru: 'Реестр операций обработки ПДн (GDPR ст. 30).',
    },
  },
  {
    term: 'ITGC',
    category: 'it',
    definition: { en: 'IT General Controls.', ru: 'Общие ИТ-контроли.' },
  },
];

export async function seedGlossary(): Promise<void> {
  const owner = new Client({
    connectionString: env.databaseUrlOwner,
    connectionTimeoutMillis: 5000,
  });
  try {
    await owner.connect();
    const db = drizzle(owner);
    for (const t of GLOSSARY_TERMS) {
      const [existing] = await db
        .select()
        .from(glossaryTerm)
        .where(and(isNull(glossaryTerm.tenantId), eq(glossaryTerm.term, t.term)));
      if (existing) continue;
      await db.insert(glossaryTerm).values({
        tenantId: null,
        term: t.term,
        definitionI18n: t.definition,
        category: t.category,
      });
    }
    console.log(`✓ Глоссарий: ${GLOSSARY_TERMS.length} терминов (idempotent)`);
  } finally {
    await owner.end().catch(() => {});
  }
}

/** Демо-оргструктура (T-044): Internal Audit — уровень группы, IT Department — при демо-банке. */
async function seedDemoDepartments(db: NodePgDatabase, tenantId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    const existing = await tx.select().from(department).where(eq(department.tenantId, tenantId));
    if (existing.length > 0) return;
    const [bank] = await tx
      .select()
      .from(subsidiary)
      .where(and(eq(subsidiary.tenantId, tenantId), eq(subsidiary.code, 'demo-bank')));
    const [audit] = await tx
      .insert(department)
      .values({
        tenantId,
        subsidiaryId: null,
        nameI18n: { en: 'Internal Audit', az: 'Daxili audit', ru: 'Внутренний аудит' },
      })
      .returning();
    const [it] = await tx
      .insert(department)
      .values({
        tenantId,
        subsidiaryId: bank?.id ?? null,
        nameI18n: { en: 'IT Department', az: 'İT şöbəsi', ru: 'ИТ-департамент' },
      })
      .returning();
    // демо-юзеры по департаментам: admin — аудит-функция, collaborator — ИТ дочки
    const assign = async (email: string, departmentId: string | undefined) => {
      if (!departmentId) return;
      const [u] = await db.select().from(user).where(eq(user.email, email));
      if (!u) return;
      await db
        .update(membership)
        .set({ departmentId })
        .where(and(eq(membership.userId, u.id), eq(membership.tenantId, tenantId)));
    };
    await assign('admin@demo.io', audit?.id);
    await assign('collaborator@demo.io', it?.id);
  });
  console.log(
    '✓ Демо-департаменты: Internal Audit (группа), IT Department (демо-банк) (idempotent)',
  );
}

/**
 * Демо-адаптация контроля (T-032, ADR-0016 override): тенантская копия GOV-01
 * с owner'ом-админом, записью history и комментом — живой экран контроля.
 */
async function seedDemoControlAdaptation(db: NodePgDatabase, tenantId: string): Promise<void> {
  const [admin] = await db.select().from(user).where(eq(user.email, 'admin@demo.io'));
  if (!admin) throw new Error('admin@demo.io не найден — сид юзеров не прошёл?');
  const [adminMembership] = await db
    .select()
    .from(membership)
    .where(and(eq(membership.userId, admin.id), eq(membership.tenantId, tenantId)));
  if (!adminMembership) throw new Error('membership админа не найден');
  // глобальный оригинал читается без контекста (RLS: tenant_id NULL видen всем)
  const [origin] = await db
    .select()
    .from(control)
    .where(and(isNull(control.tenantId), eq(control.ref, 'GOV-01')));
  if (!origin) throw new Error('Глобальный GOV-01 не найден — сид контролей не прошёл?');

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    const existing = await tx
      .select()
      .from(control)
      .where(and(eq(control.tenantId, tenantId), eq(control.ref, 'GOV-01')));
    if (existing.length > 0) return;
    const [adapted] = await tx
      .insert(control)
      .values({
        tenantId,
        originControlId: origin.id,
        ref: origin.ref,
        domainId: origin.domainId,
        objectiveI18n: origin.objectiveI18n,
        questionI18n: origin.questionI18n,
        guidanceI18n: {
          en: 'Group adaptation: review the policy pack against CBAR requirements as well.',
          ru: 'Адаптация группы: сверять пакет политик также с требованиями CBAR.',
        },
        ownerMembershipId: adminMembership.id,
      })
      .returning();
    if (!adapted) throw new Error('Адаптация GOV-01 не создалась');
    await tx.insert(auditLog).values({
      tenantId,
      actorUserId: admin.id,
      action: 'control.adapted',
      entityType: 'control',
      entityId: adapted.id,
      after: { ref: adapted.ref, originControlId: origin.id },
    });
    await tx.insert(comment).values({
      tenantId,
      entityType: 'control',
      entityId: adapted.id,
      authorUserId: admin.id,
      body: 'Adapted for the group: policy review must include CBAR checklist.',
    });
  });
  console.log('✓ Демо-адаптация GOV-01 (owner: admin, history+comment) (idempotent)');
}

/** Демо-LDAP-коннектор (T-049): указывает на тестовый openldap, capability personnel. */
async function seedDemoConnector(db: NodePgDatabase, tenantId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    const existing = await tx
      .select()
      .from(connector)
      .where(
        and(
          eq(connector.tenantId, tenantId),
          eq(connector.provider, 'ldap'),
          isNull(connector.deletedAt),
        ),
      );
    if (existing.length > 0) return;
    await tx.insert(connector).values({
      tenantId,
      provider: 'ldap',
      capabilities: ['personnel', 'access'],
      configEncrypted: encryptConfig({
        url: 'ldap://localhost:1389',
        bindDn: 'cn=admin,dc=demo,dc=io',
        bindPassword: 'admin',
        searchBase: 'ou=people,dc=demo,dc=io',
      }),
    });
  });
  console.log('✓ Демо-коннектор LDAP (personnel, тестовый openldap) (idempotent)');
}

/** Демо-автотест (T-050): на демо-LDAP-коннекторе, правило «у всех аккаунтов есть email». */
async function seedDemoAutoTest(db: NodePgDatabase, tenantId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    const [existing] = await tx
      .select()
      .from(test)
      .where(and(eq(test.tenantId, tenantId), eq(test.kind, 'automated'), isNull(test.deletedAt)));
    if (existing) return;
    const [conn] = await tx
      .select()
      .from(connector)
      .where(and(eq(connector.tenantId, tenantId), isNull(connector.deletedAt)));
    // AC-01 — глобальный контроль (tenant_id NULL, читаем без ограничения)
    const [ac01] = await tx
      .select()
      .from(control)
      .where(and(isNull(control.tenantId), eq(control.ref, 'AC-01')));
    if (!conn || !ac01) return;
    await tx.insert(test).values({
      tenantId,
      controlId: ac01.id,
      titleI18n: { en: 'All LDAP accounts have email', ru: 'У всех LDAP-аккаунтов есть email' },
      kind: 'automated',
      connectorId: conn.id,
      checkConfig: { type: 'field_present', field: 'email' },
    });
  });
  console.log('✓ Демо-автотест (LDAP-коннектор, правило email) (idempotent)');
}

async function seedRedis(): Promise<void> {
  const redis = new Redis(env.redisUrl, {
    connectTimeout: 5000,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  try {
    await redis.connect();
    await redis.ping();
    console.log('✓ Redis доступен');
  } finally {
    redis.disconnect();
  }
}

async function seedS3(): Promise<void> {
  const s3 = new S3Client({
    endpoint: env.s3Endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: env.s3AccessKey, secretAccessKey: env.s3SecretKey },
  });
  try {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: env.s3Bucket }));
      console.log(`✓ Бакет ${env.s3Bucket} уже есть`);
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: env.s3Bucket }));
      console.log(`✓ Бакет ${env.s3Bucket} создан`);
    }
    await s3.send(
      new PutObjectCommand({
        Bucket: env.s3Bucket,
        Key: DEMO_OBJECT_KEY,
        Body: `IT Audit Platform — демо-файл seed'а.\nПерезаписывается при каждом прогоне: ${new Date().toISOString()}\n`,
        ContentType: 'text/plain; charset=utf-8',
      }),
    );
    console.log(`✓ Демо-файл ${DEMO_OBJECT_KEY} загружен`);
  } finally {
    s3.destroy();
  }
}

async function main(): Promise<void> {
  console.log('Seed: инфраструктура docker-compose должна быть поднята (pnpm infra:up)');
  await Promise.all([seedPostgres(), seedRedis(), seedS3()]);
  console.log('Seed завершён.');
}

// Гард: демо-сид запускается только при прямом вызове (node dist/seed.js),
// не при импорте функций из bootstrap.ts (T-I07).
if (require.main === module) {
  main().catch((error) => {
    console.error('Seed провалился:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
