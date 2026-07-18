import { BadRequestException, Injectable } from '@nestjs/common';
import { and, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { i18nTextSchema } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { auditType, configList, customFieldDef, glossaryTerm } from '../db/schema';
import { DbService } from '../db/db.service';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** Схема импортируемого бандла (TEC-04) — валидируем, чтобы не залить мусор. */
const bundleSchema = z.object({
  version: z.literal(1),
  auditTypes: z.array(z.object({ code: z.string(), nameI18n: i18nTextSchema })).default([]),
  configLists: z.array(z.object({ listKey: z.string(), items: z.array(z.unknown()) })).default([]),
  customFieldDefs: z
    .array(
      z.object({
        entityType: z.string(),
        key: z.string(),
        labelI18n: i18nTextSchema,
        fieldType: z.string(),
        options: z.array(z.unknown()).default([]),
        required: z.boolean().default(false),
      }),
    )
    .default([]),
  glossaryTerms: z
    .array(z.object({ term: z.string(), definitionI18n: i18nTextSchema, category: z.string().nullable().optional() }))
    .default([]),
});
export type ConfigBundle = z.infer<typeof bundleSchema>;

@Injectable()
export class ConfigTransferService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** Экспорт кастомной конфигурации тенанта (TEC-04). */
  async export(tenantId: string): Promise<ConfigBundle> {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const auditTypes = await tx
        .select({ code: auditType.code, nameI18n: auditType.nameI18n })
        .from(auditType)
        .where(isNotNull(auditType.tenantId)); // только кастомные (global не экспортируем)
      const configLists = await tx
        .select({ listKey: configList.listKey, items: configList.items })
        .from(configList);
      const customFieldDefs = await tx
        .select({
          entityType: customFieldDef.entityType,
          key: customFieldDef.key,
          labelI18n: customFieldDef.labelI18n,
          fieldType: customFieldDef.fieldType,
          options: customFieldDef.options,
          required: customFieldDef.required,
        })
        .from(customFieldDef)
        .where(isNull(customFieldDef.deletedAt));
      const glossaryTerms = await tx
        .select({ term: glossaryTerm.term, definitionI18n: glossaryTerm.definitionI18n, category: glossaryTerm.category })
        .from(glossaryTerm)
        .where(and(isNotNull(glossaryTerm.tenantId), isNull(glossaryTerm.deletedAt)));
      return {
        version: 1 as const,
        auditTypes,
        configLists: configLists.map((c) => ({ listKey: c.listKey, items: c.items as unknown[] })),
        customFieldDefs: customFieldDefs.map((c) => ({ ...c, options: c.options as unknown[] })),
        glossaryTerms: glossaryTerms.map((g) => ({ ...g, category: g.category ?? null })),
      };
    });
  }

  /** Импорт бандла в тенант (idempotent upsert). */
  async import(actor: Actor, raw: unknown) {
    const parsed = bundleSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const b = parsed.data;
    const counts = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      for (const t of b.auditTypes) {
        await tx
          .insert(auditType)
          .values({ tenantId: actor.tenantId, code: t.code, nameI18n: t.nameI18n })
          .onConflictDoUpdate({ target: [auditType.tenantId, auditType.code], set: { nameI18n: t.nameI18n } });
      }
      for (const l of b.configLists) {
        await tx
          .insert(configList)
          .values({ tenantId: actor.tenantId, listKey: l.listKey, items: l.items })
          .onConflictDoUpdate({ target: [configList.tenantId, configList.listKey], set: { items: l.items } });
      }
      for (const f of b.customFieldDefs) {
        await tx
          .insert(customFieldDef)
          .values({
            tenantId: actor.tenantId,
            entityType: f.entityType,
            key: f.key,
            labelI18n: f.labelI18n,
            fieldType: f.fieldType,
            options: f.options,
            required: f.required,
          })
          .onConflictDoUpdate({
            target: [customFieldDef.tenantId, customFieldDef.entityType, customFieldDef.key],
            set: { labelI18n: f.labelI18n, fieldType: f.fieldType, options: f.options, required: f.required },
          });
      }
      for (const g of b.glossaryTerms) {
        await tx
          .insert(glossaryTerm)
          .values({ tenantId: actor.tenantId, term: g.term, definitionI18n: g.definitionI18n, category: g.category ?? null })
          .onConflictDoUpdate({ target: [glossaryTerm.tenantId, glossaryTerm.term], set: { definitionI18n: g.definitionI18n } });
      }
      return {
        auditTypes: b.auditTypes.length,
        configLists: b.configLists.length,
        customFieldDefs: b.customFieldDefs.length,
        glossaryTerms: b.glossaryTerms.length,
      };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'config.imported',
      entityType: 'config_bundle',
      after: counts,
    });
    return { imported: counts };
  }
}
