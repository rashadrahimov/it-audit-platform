import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { control, controlDomain } from '../db/schema';
import { parseChecklistWorkbook } from './checklist-workbook';
import type { ParsedChecklistRow } from './checklist-parser';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** Импорт исторических данных (EP-MIGRATE, T-H12/T-H14). */
@Injectable()
export class MigrationService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** Разобрать загруженный чеклист-шаблон (.xlsx) → строки-контроли (без создания). */
  async previewChecklist(buffer: Buffer) {
    const rows = await parseChecklistWorkbook(buffer);
    return { count: rows.length, rows };
  }

  /**
   * Импорт строк-контролей в тенант-библиотеку (T-H14): домен по префиксу ref (GOV-01→GOV),
   * control (ref/objective/question). Идемпотентно (по tenant+ref). Дубль → skip.
   */
  async importChecklist(actor: Actor, rows: ParsedChecklistRow[]) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      let domains = 0;
      let controls = 0;
      let skipped = 0;
      const domainIdByCode = new Map<string, string>();
      for (const row of rows) {
        const code = row.ref.split('-')[0] ?? row.ref;
        let domainId = domainIdByCode.get(code);
        if (!domainId) {
          const [existingD] = await tx
            .select({ id: controlDomain.id })
            .from(controlDomain)
            .where(and(eq(controlDomain.tenantId, actor.tenantId), eq(controlDomain.code, code)));
          if (existingD) {
            domainId = existingD.id;
          } else {
            const [d] = await tx
              .insert(controlDomain)
              .values({ tenantId: actor.tenantId, code, nameI18n: { en: row.domain ?? code } })
              .returning({ id: controlDomain.id });
            domainId = d!.id;
            domains += 1;
          }
          domainIdByCode.set(code, domainId);
        }
        const [existingC] = await tx
          .select({ id: control.id })
          .from(control)
          .where(and(eq(control.tenantId, actor.tenantId), eq(control.ref, row.ref)));
        if (existingC) {
          skipped += 1;
          continue;
        }
        await tx.insert(control).values({
          tenantId: actor.tenantId,
          ref: row.ref,
          domainId,
          objectiveI18n: { en: row.objective ?? '' },
          questionI18n: { en: row.question ?? '' },
        });
        controls += 1;
      }
      return { domains, controls, skipped };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'migration.checklist_imported',
      entityType: 'control',
      after: result,
    });
    return result;
  }
}
