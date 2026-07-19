import { BadRequestException, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { workingPaper, wpAnnotation } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

export interface CreateAnnotation {
  workingPaperId: string;
  kind: 'comment' | 'tick_mark' | 'exception';
  anchor?: string;
  body: string;
}

/**
 * Аннотации рабочих документов (EP-ANNOT buildable-срез, T-H19, WP-06/WP-09): CRUD
 * комментариев/tick-marks/exception'ов как данных. Визуальный рендерер — [!] (ADR-0017).
 */
@Injectable()
export class AnnotationsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(actor: Actor, input: CreateAnnotation) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [wp] = await tx
        .select({ id: workingPaper.id })
        .from(workingPaper)
        .where(eq(workingPaper.id, input.workingPaperId));
      if (!wp) throw new BadRequestException(`Рабочий документ ${input.workingPaperId} не найден`);
      const [row] = await tx
        .insert(wpAnnotation)
        .values({
          tenantId: actor.tenantId,
          workingPaperId: input.workingPaperId,
          kind: input.kind,
          anchor: input.anchor ?? null,
          body: input.body,
        })
        .returning({ id: wpAnnotation.id });
      if (!row) throw new Error('Аннотация не создалась');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'wp_annotation.created',
      entityType: 'wp_annotation',
      entityId: created.id,
      after: { workingPaperId: input.workingPaperId, kind: input.kind },
    });
    return { id: created.id };
  }

  async list(tenantId: string, workingPaperId: string) {
    return this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: wpAnnotation.id,
          kind: wpAnnotation.kind,
          anchor: wpAnnotation.anchor,
          body: wpAnnotation.body,
          resolvedAt: wpAnnotation.resolvedAt,
          createdAt: wpAnnotation.createdAt,
        })
        .from(wpAnnotation)
        .where(eq(wpAnnotation.workingPaperId, workingPaperId))
        .orderBy(desc(wpAnnotation.createdAt)),
    );
  }

  async resolve(actor: Actor, id: string) {
    await this.dbService.withTenant(actor.tenantId, (tx) =>
      tx
        .update(wpAnnotation)
        .set({ resolvedAt: new Date() })
        .where(and(eq(wpAnnotation.id, id), eq(wpAnnotation.tenantId, actor.tenantId))),
    );
    return { id, resolved: true };
  }

  async remove(actor: Actor, id: string) {
    await this.dbService.withTenant(actor.tenantId, (tx) =>
      tx.delete(wpAnnotation).where(eq(wpAnnotation.id, id)),
    );
    return { id };
  }
}
