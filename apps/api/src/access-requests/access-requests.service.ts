import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { account, accessRequest, deprovisioningTask, membership } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** Access requests + deprovisioning (T-056, ADR-0012). */
@Injectable()
export class AccessRequestsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async myMembership(
    tx: Parameters<Parameters<DbService['withTenant']>[1]>[0],
    actor: Actor,
  ) {
    const [me] = await tx
      .select({ id: membership.id })
      .from(membership)
      .where(and(eq(membership.userId, actor.userId), eq(membership.tenantId, actor.tenantId)));
    return me?.id ?? null;
  }

  async request(
    actor: Actor,
    input: { system: string; justification?: string; approverMembershipId?: string },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const meId = await this.myMembership(tx, actor);
      if (!meId) throw new BadRequestException('У юзера нет membership в тенанте');
      const [row] = await tx
        .insert(accessRequest)
        .values({
          tenantId: actor.tenantId,
          requesterMembershipId: meId,
          system: input.system,
          justification: input.justification ?? null,
          approverMembershipId: input.approverMembershipId ?? null,
        })
        .returning();
      if (!row) throw new Error('Запрос не создался');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'access_request.created',
      entityType: 'access_request',
      entityId: created.id,
      after: { system: created.system },
    });
    return { id: created.id, status: created.status };
  }

  async decide(actor: Actor, id: string, decision: 'approve' | 'reject') {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx.select().from(accessRequest).where(eq(accessRequest.id, id));
      if (!row) throw new NotFoundException(`Запрос ${id} не найден`);
      if (row.status !== 'pending') throw new BadRequestException('Запрос уже обработан');
      // если approver назначен — решать может только он
      if (row.approverMembershipId) {
        const meId = await this.myMembership(tx, actor);
        if (meId !== row.approverMembershipId) {
          throw new ForbiddenException('Решение может принять только назначенный approver');
        }
      }
      const [updated] = await tx
        .update(accessRequest)
        .set({ status: decision === 'approve' ? 'approved' : 'rejected', decidedAt: new Date() })
        .where(eq(accessRequest.id, id))
        .returning();
      return updated!;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'access_request.decided',
      entityType: 'access_request',
      entityId: id,
      after: { status: result.status },
    });
    return { status: result.status };
  }

  async listRequests(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx.select().from(accessRequest).orderBy(asc(accessRequest.createdAt)),
    );
    return rows.map((r) => ({ id: r.id, system: r.system, status: r.status }));
  }

  async createDeprovisioning(
    actor: Actor,
    input: { accountId: string; reason?: string; dueDate?: string },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [acc] = await tx
        .select({ id: account.id })
        .from(account)
        .where(eq(account.id, input.accountId));
      if (!acc) throw new BadRequestException('accountId не найден');
      const [row] = await tx
        .insert(deprovisioningTask)
        .values({
          tenantId: actor.tenantId,
          accountId: input.accountId,
          reason: input.reason ?? null,
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
      action: 'deprovisioning.created',
      entityType: 'deprovisioning_task',
      entityId: created.id,
      after: { accountId: created.accountId },
    });
    return { id: created.id, status: created.status, slaStatus: created.slaStatus };
  }

  /** Закрыть deprovisioning-задачу: задача done + аккаунт деактивирован. */
  async completeDeprovisioning(actor: Actor, id: string) {
    const done = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .update(deprovisioningTask)
        .set({ status: 'done', completedAt: sql`now()` })
        .where(and(eq(deprovisioningTask.id, id), eq(deprovisioningTask.status, 'open')))
        .returning();
      if (!row) throw new NotFoundException('Задача не найдена или уже закрыта');
      await tx
        .update(account)
        .set({ status: 'deactivated', deactivatedInSource: sql`now()` })
        .where(eq(account.id, row.accountId));
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'deprovisioning.completed',
      entityType: 'deprovisioning_task',
      entityId: id,
    });
    return { status: done.status };
  }

  async listDeprovisioning(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: deprovisioningTask.id,
          status: deprovisioningTask.status,
          slaStatus: deprovisioningTask.slaStatus,
          dueDate: deprovisioningTask.dueDate,
          account: account.identifier,
        })
        .from(deprovisioningTask)
        .innerJoin(account, eq(deprovisioningTask.accountId, account.id))
        .where(isNull(deprovisioningTask.completedAt))
        .orderBy(asc(deprovisioningTask.createdAt)),
    );
    return rows.map((r) => ({
      id: r.id,
      account: r.account,
      status: r.status,
      slaStatus: r.slaStatus,
      dueDate: r.dueDate?.toISOString() ?? null,
    }));
  }
}
