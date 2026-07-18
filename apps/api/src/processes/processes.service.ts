import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { I18nText } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { auditableEntity, businessProcess } from '../db/schema';
import { UniverseService } from '../universe/universe.service';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

interface CreateInput {
  nameI18n: I18nText;
  criticality?: string;
  subsidiaryId?: string;
  ownerMembershipId?: string;
  scoring?: Record<string, unknown>;
}

@Injectable()
export class ProcessesService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
    private readonly universeService: UniverseService,
  ) {}

  async create(actor: Actor, input: CreateInput) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(businessProcess)
        .values({
          tenantId: actor.tenantId,
          subsidiaryId: input.subsidiaryId ?? null,
          nameI18n: input.nameI18n,
          criticality: input.criticality ?? 'medium',
          ownerMembershipId: input.ownerMembershipId ?? null,
          scoring: input.scoring ?? {},
        })
        .returning();
      if (!row) throw new Error('Процесс не создался');
      return row;
    });
    // проекция в audit universe (kind=process, ref_id=business_process.id)
    const node = await this.universeService.create(actor, {
      kind: 'process',
      nameI18n: created.nameI18n,
      ownerMembershipId: created.ownerMembershipId ?? undefined,
      refId: created.id,
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'business_process.created',
      entityType: 'business_process',
      entityId: created.id,
      after: { criticality: created.criticality, scope: created.subsidiaryId ? 'local' : 'group', entityId: node.id },
    });
    return { id: created.id, entityId: node.id, scope: created.subsidiaryId ? 'local' : 'group' };
  }

  async list(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: businessProcess.id,
          nameI18n: businessProcess.nameI18n,
          criticality: businessProcess.criticality,
          subsidiaryId: businessProcess.subsidiaryId,
          ownerMembershipId: businessProcess.ownerMembershipId,
          entityId: auditableEntity.id,
        })
        .from(businessProcess)
        .leftJoin(
          auditableEntity,
          and(eq(auditableEntity.refId, businessProcess.id), isNull(auditableEntity.deletedAt)),
        )
        .where(isNull(businessProcess.deletedAt))
        .orderBy(desc(businessProcess.createdAt)),
    );
    return rows.map((p) => ({
      id: p.id,
      nameI18n: p.nameI18n,
      criticality: p.criticality,
      scope: p.subsidiaryId ? 'local' : 'group',
      ownerMembershipId: p.ownerMembershipId,
      entityId: p.entityId,
    }));
  }

  async get(tenantId: string, id: string) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(businessProcess)
        .where(and(eq(businessProcess.id, id), isNull(businessProcess.deletedAt)));
      if (!row) throw new NotFoundException(`Процесс ${id} не найден`);
      return {
        id: row.id,
        nameI18n: row.nameI18n,
        criticality: row.criticality,
        scope: row.subsidiaryId ? 'local' : 'group',
        subsidiaryId: row.subsidiaryId,
        ownerMembershipId: row.ownerMembershipId,
        scoring: row.scoring,
      };
    });
  }
}
