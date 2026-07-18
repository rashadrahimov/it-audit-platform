import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { resolveLocalized, type I18nText, type Locale } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { auditType, auditTypeTemplateItem, checklistItem, engagement } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

@Injectable()
export class AuditTypesService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** Список типов: global (сид) + кастомные тенанта (RLS read=global|tenant). */
  async list(tenantId: string, locale: Locale) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx.select().from(auditType).orderBy(asc(auditType.code)),
    );
    return rows.map((t) => ({
      id: t.id,
      code: t.code,
      name: resolveLocalized(t.nameI18n, locale),
      nameI18n: t.nameI18n,
      isGlobal: t.tenantId === null,
    }));
  }

  async create(actor: Actor, input: { code: string; nameI18n: I18nText }) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(auditType)
        .values({ tenantId: actor.tenantId, code: input.code, nameI18n: input.nameI18n })
        .onConflictDoNothing({ target: [auditType.tenantId, auditType.code] })
        .returning();
      if (!row) throw new BadRequestException(`Тип «${input.code}» уже существует`);
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'audit_type.created',
      entityType: 'audit_type',
      entityId: created.id,
      after: { code: created.code },
    });
    return { id: created.id, code: created.code };
  }

  /** Добавить пункт в типо-специфичный шаблон чеклиста (T-085, UNI-06). */
  async addTemplateItem(
    actor: Actor,
    auditTypeId: string,
    input: { ref: string; objectiveI18n: I18nText; questionI18n: I18nText; order?: number },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [type] = await tx.select({ id: auditType.id }).from(auditType).where(eq(auditType.id, auditTypeId));
      if (!type) throw new BadRequestException(`Тип аудита ${auditTypeId} не найден`);
      const [row] = await tx
        .insert(auditTypeTemplateItem)
        .values({
          tenantId: actor.tenantId,
          auditTypeId,
          ref: input.ref,
          objectiveI18n: input.objectiveI18n,
          questionI18n: input.questionI18n,
          order: input.order ?? 0,
        })
        .returning();
      return row!;
    });
    return { id: created.id };
  }

  async listTemplateItems(tenantId: string, auditTypeId: string) {
    return this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: auditTypeTemplateItem.id,
          ref: auditTypeTemplateItem.ref,
          order: auditTypeTemplateItem.order,
        })
        .from(auditTypeTemplateItem)
        .where(eq(auditTypeTemplateItem.auditTypeId, auditTypeId))
        .orderBy(asc(auditTypeTemplateItem.order)),
    );
  }

  /** Засеять checklist engagement из шаблона его типа аудита (UNI-06). */
  async seedChecklist(actor: Actor, engagementId: string) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [eng] = await tx
        .select({ id: engagement.id, auditTypeId: engagement.auditTypeId })
        .from(engagement)
        .where(and(eq(engagement.id, engagementId), isNull(engagement.deletedAt)));
      if (!eng) throw new NotFoundException(`Engagement ${engagementId} не найден`);
      if (!eng.auditTypeId) throw new BadRequestException('У engagement не задан тип аудита');
      const template = await tx
        .select()
        .from(auditTypeTemplateItem)
        .where(eq(auditTypeTemplateItem.auditTypeId, eng.auditTypeId))
        .orderBy(asc(auditTypeTemplateItem.order));
      let seeded = 0;
      for (const t of template) {
        await tx.insert(checklistItem).values({
          engagementId,
          ref: t.ref,
          objectiveI18n: t.objectiveI18n,
          questionI18n: t.questionI18n,
          order: t.order,
        });
        seeded += 1;
      }
      return seeded;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'audit_type.checklist_seeded',
      entityType: 'engagement',
      entityId: engagementId,
      after: { seeded: result },
    });
    return { seeded: result };
  }
}
