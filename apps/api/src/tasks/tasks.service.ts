import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { membership, task, user } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** Полиморфные сущности, к которым крепятся задачи (T-V27; personnel — T-V26). */
const TASKABLE = new Set(['finding', 'risk', 'control', 'vendor', 'policy', 'personnel']);

export interface CreateTaskInput {
  entityType: string;
  entityId: string;
  title: string;
  assigneeMembershipId?: string;
  dueDate?: string;
}

/** Задачи ремедиации (T-V27): декомпозиция finding/risk на шаги с due/assignee. */
@Injectable()
export class TasksService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async list(tenantId: string, entityType: string, entityId: string) {
    if (!TASKABLE.has(entityType)) {
      throw new BadRequestException(`entityType: ожидается ${[...TASKABLE].join('|')}`);
    }
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: task.id,
          title: task.title,
          status: task.status,
          assigneeMembershipId: task.assigneeMembershipId,
          assignee: user.fullName,
          dueDate: task.dueDate,
          completedAt: task.completedAt,
        })
        .from(task)
        .leftJoin(membership, eq(task.assigneeMembershipId, membership.id))
        .leftJoin(user, eq(membership.userId, user.id))
        .where(and(eq(task.entityType, entityType), eq(task.entityId, entityId)))
        .orderBy(asc(task.createdAt)),
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      assigneeMembershipId: r.assigneeMembershipId,
      assignee: r.assignee,
      dueDate: r.dueDate?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
    }));
  }

  async create(actor: Actor, input: CreateTaskInput) {
    if (!TASKABLE.has(input.entityType)) {
      throw new BadRequestException(`entityType: ожидается ${[...TASKABLE].join('|')}`);
    }
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      if (input.assigneeMembershipId) {
        const [m] = await tx
          .select({ id: membership.id })
          .from(membership)
          .where(
            and(
              eq(membership.id, input.assigneeMembershipId),
              eq(membership.tenantId, actor.tenantId),
            ),
          );
        if (!m) throw new BadRequestException('assignee: участник не найден в тенанте');
      }
      const [row] = await tx
        .insert(task)
        .values({
          tenantId: actor.tenantId,
          entityType: input.entityType,
          entityId: input.entityId,
          title: input.title,
          assigneeMembershipId: input.assigneeMembershipId ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
        })
        .returning();
      if (!row) throw new Error('Задача не создалась');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'task.created',
      entityType: input.entityType,
      entityId: input.entityId,
      after: { title: created.title, taskId: created.id },
    });
    return { id: created.id, status: created.status };
  }

  /** Смена статуса/полей задачи; done проставляет completed_at. */
  async update(
    actor: Actor,
    id: string,
    input: { status?: string; assigneeMembershipId?: string | null; dueDate?: string | null },
  ) {
    const updated = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx.select().from(task).where(eq(task.id, id));
      if (!row) throw new NotFoundException(`Задача ${id} не найдена`);
      if (input.assigneeMembershipId) {
        const [m] = await tx
          .select({ id: membership.id })
          .from(membership)
          .where(
            and(
              eq(membership.id, input.assigneeMembershipId),
              eq(membership.tenantId, actor.tenantId),
            ),
          );
        if (!m) throw new BadRequestException('assignee: участник не найден в тенанте');
      }
      const patch: Record<string, unknown> = {};
      if (input.status !== undefined) {
        patch.status = input.status;
        patch.completedAt = input.status === 'done' ? new Date() : null;
      }
      if (input.assigneeMembershipId !== undefined) {
        patch.assigneeMembershipId = input.assigneeMembershipId;
      }
      if (input.dueDate !== undefined) {
        patch.dueDate = input.dueDate ? new Date(input.dueDate) : null;
      }
      const [res] = await tx.update(task).set(patch).where(eq(task.id, id)).returning();
      return res!;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'task.updated',
      entityType: updated.entityType,
      entityId: updated.entityId,
      after: { taskId: id, status: updated.status },
    });
    return { id: updated.id, status: updated.status };
  }

  /**
   * T-V26: массово создать задачи-чеклист для сущности (on/offboarding).
   * Внутри уже открытой транзакции тенанта — вызывается из PersonnelService.
   */
  async seedForEntity(
    tx: Parameters<Parameters<DbService['withTenant']>[1]>[0],
    tenantId: string,
    entityType: string,
    entityId: string,
    titles: string[],
    dueDate?: Date | null,
  ) {
    if (titles.length === 0) return 0;
    await tx.insert(task).values(
      titles.map((title) => ({
        tenantId,
        entityType,
        entityId,
        title,
        dueDate: dueDate ?? null,
      })),
    );
    return titles.length;
  }

  /** T-V26: сводка задач сущности — open/overdue/total (для «Task status»). */
  summarize(rows: Array<{ status: string; dueDate: Date | null }>, now: Date) {
    const total = rows.length;
    const open = rows.filter((r) => r.status !== 'done').length;
    const overdue = rows.filter(
      (r) => r.status !== 'done' && r.dueDate !== null && r.dueDate < now,
    ).length;
    return { total, open, overdue };
  }

  async remove(actor: Actor, id: string) {
    const removed = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx.select().from(task).where(eq(task.id, id));
      if (!row) throw new NotFoundException(`Задача ${id} не найдена`);
      await tx.delete(task).where(eq(task.id, id));
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'task.deleted',
      entityType: removed.entityType,
      entityId: removed.entityId,
      before: { taskId: id, title: removed.title },
    });
    return { deleted: true };
  }
}
