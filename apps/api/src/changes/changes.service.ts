import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { asset, codeChange, membership } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** Approval-workflow изменения (T-063): requested→approved→deployed (+reject→rejected). */
const FLOW: Record<string, string[]> = {
  requested: ['approved', 'rejected'],
  approved: ['deployed'],
};

@Injectable()
export class ChangesService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    actor: Actor,
    input: {
      title: string;
      type?: string;
      risk?: string;
      assetId?: string;
      approverMembershipId?: string;
    },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [me] = await tx
        .select({ id: membership.id })
        .from(membership)
        .where(and(eq(membership.userId, actor.userId), eq(membership.tenantId, actor.tenantId)));
      const [row] = await tx
        .insert(codeChange)
        .values({
          tenantId: actor.tenantId,
          title: input.title,
          type: input.type ?? null,
          risk: input.risk ?? null,
          assetId: input.assetId ?? null,
          requesterMembershipId: me?.id ?? null,
          approverMembershipId: input.approverMembershipId ?? null,
        })
        .returning();
      if (!row) throw new Error('Изменение не создалось');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'change.created',
      entityType: 'code_change',
      entityId: created.id,
      after: { title: created.title },
    });
    return { id: created.id, status: created.status };
  }

  async transition(actor: Actor, id: string, to: string) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(codeChange)
        .where(and(eq(codeChange.id, id), isNull(codeChange.deletedAt)));
      if (!row) throw new NotFoundException(`Изменение ${id} не найдено`);
      if (!FLOW[row.status]?.includes(to)) {
        throw new BadRequestException(`Переход ${row.status} → ${to} недопустим`);
      }
      // approve/reject — только назначенный approver (если задан)
      if ((to === 'approved' || to === 'rejected') && row.approverMembershipId) {
        const [me] = await tx
          .select({ id: membership.id })
          .from(membership)
          .where(and(eq(membership.userId, actor.userId), eq(membership.tenantId, actor.tenantId)));
        if (me?.id !== row.approverMembershipId) {
          throw new ForbiddenException('Утверждать может только назначенный approver');
        }
      }
      await tx
        .update(codeChange)
        .set({
          status: to,
          approvedAt: to === 'approved' ? sql`now()` : row.approvedAt,
          deployedAt: to === 'deployed' ? sql`now()` : row.deployedAt,
        })
        .where(eq(codeChange.id, id));
      return { before: row.status, after: to };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'change.status_changed',
      entityType: 'code_change',
      entityId: id,
      before: { status: result.before },
      after: { status: result.after },
    });
    return result;
  }

  async list(tenantId: string, filters?: { status?: string; type?: string; assetId?: string }) {
    const conds = [isNull(codeChange.deletedAt)];
    if (filters?.status) conds.push(eq(codeChange.status, filters.status));
    if (filters?.type) conds.push(eq(codeChange.type, filters.type));
    if (filters?.assetId) conds.push(eq(codeChange.assetId, filters.assetId));
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: codeChange.id,
          title: codeChange.title,
          type: codeChange.type,
          risk: codeChange.risk,
          status: codeChange.status,
          assetId: codeChange.assetId,
          assetName: asset.name,
        })
        .from(codeChange)
        .leftJoin(asset, eq(asset.id, codeChange.assetId))
        .where(and(...conds))
        .orderBy(desc(codeChange.createdAt)),
    );
    return rows.map((c) => ({
      id: c.id,
      title: c.title,
      type: c.type,
      risk: c.risk,
      status: c.status,
      assetId: c.assetId,
      assetName: c.assetName,
    }));
  }
}
