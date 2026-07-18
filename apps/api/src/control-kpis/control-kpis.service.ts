import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { control, controlKpi } from '../db/schema';
import { DbService } from '../db/db.service';
import { onTrack } from './on-track';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

@Injectable()
export class ControlKpisService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    actor: Actor,
    input: {
      controlId: string;
      name: string;
      unit?: string;
      targetValue?: number;
      currentValue?: number;
      direction?: string;
      period?: string;
    },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [ctrl] = await tx
        .select({ id: control.id })
        .from(control)
        .where(and(eq(control.id, input.controlId), isNull(control.deletedAt)));
      if (!ctrl) throw new BadRequestException(`Контроль ${input.controlId} не найден`);
      const [row] = await tx
        .insert(controlKpi)
        .values({
          tenantId: actor.tenantId,
          controlId: input.controlId,
          name: input.name,
          unit: input.unit ?? null,
          targetValue: input.targetValue !== undefined ? input.targetValue.toFixed(2) : null,
          currentValue: input.currentValue !== undefined ? input.currentValue.toFixed(2) : null,
          direction: input.direction ?? 'higher_better',
          period: input.period ?? null,
        })
        .returning();
      if (!row) throw new Error('KPI не создался');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'control_kpi.created',
      entityType: 'control_kpi',
      entityId: created.id,
      after: { name: created.name },
    });
    return { id: created.id };
  }

  /** Обновить текущее значение KPI (замер за период). */
  async setValue(actor: Actor, id: string, currentValue: number) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(controlKpi)
        .where(and(eq(controlKpi.id, id), isNull(controlKpi.deletedAt)));
      if (!row) throw new NotFoundException(`KPI ${id} не найден`);
      await tx
        .update(controlKpi)
        .set({ currentValue: currentValue.toFixed(2) })
        .where(eq(controlKpi.id, id));
      const target = row.targetValue !== null ? Number(row.targetValue) : null;
      return { onTrack: onTrack(row.direction, target, currentValue) };
    });
    return { id, currentValue, onTrack: result.onTrack };
  }

  async listForControl(tenantId: string, controlId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(controlKpi)
        .where(and(eq(controlKpi.controlId, controlId), isNull(controlKpi.deletedAt)))
        .orderBy(desc(controlKpi.createdAt)),
    );
    return rows.map((k) => {
      const target = k.targetValue !== null ? Number(k.targetValue) : null;
      const current = k.currentValue !== null ? Number(k.currentValue) : null;
      return {
        id: k.id,
        name: k.name,
        unit: k.unit,
        target,
        current,
        direction: k.direction,
        onTrack: onTrack(k.direction, target, current),
      };
    });
  }
}
