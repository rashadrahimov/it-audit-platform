import { BadRequestException, Injectable } from '@nestjs/common';
import { asc } from 'drizzle-orm';
import { resolveLocalized, type I18nText, type Locale } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { auditType } from '../db/schema';

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
}
