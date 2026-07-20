import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { I18nText } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { processingActivity, vendor } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

interface CreateInput {
  nameI18n: I18nText;
  legalBasis: string;
  purpose?: string;
  role?: string;
  dataCategories?: unknown[];
  dataSubjects?: unknown[];
  recipients?: unknown[];
  retentionPeriod?: string;
  crossBorder?: boolean;
  ownerMembershipId?: string;
  vendorId?: string;
  dataLocations?: string[];
  reviewOwnerMembershipId?: string;
  reviewDate?: string;
}

@Injectable()
export class ProcessingActivitiesService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(actor: Actor, input: CreateInput) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(processingActivity)
        .values({
          tenantId: actor.tenantId,
          nameI18n: input.nameI18n,
          legalBasis: input.legalBasis,
          purpose: input.purpose ?? null,
          role: input.role ?? 'controller',
          dataCategories: input.dataCategories ?? [],
          dataSubjects: input.dataSubjects ?? [],
          recipients: input.recipients ?? [],
          retentionPeriod: input.retentionPeriod ?? null,
          crossBorder: input.crossBorder ?? false,
          ownerMembershipId: input.ownerMembershipId ?? null,
          vendorId: input.vendorId ?? null,
          dataLocations: input.dataLocations ?? [],
          reviewOwnerMembershipId: input.reviewOwnerMembershipId ?? null,
          reviewDate: input.reviewDate ? new Date(input.reviewDate) : null,
        })
        .returning();
      if (!row) throw new Error('Операция обработки не создалась');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'processing_activity.created',
      entityType: 'processing_activity',
      entityId: created.id,
      after: { legalBasis: created.legalBasis, role: created.role },
    });
    return { id: created.id, status: created.status };
  }

  async archive(actor: Actor, id: string) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select({ status: processingActivity.status })
        .from(processingActivity)
        .where(and(eq(processingActivity.id, id), isNull(processingActivity.deletedAt)));
      if (!row) throw new NotFoundException(`Операция обработки ${id} не найдена`);
      if (row.status === 'archived') throw new BadRequestException('Уже архивирована');
      await tx
        .update(processingActivity)
        .set({ status: 'archived' })
        .where(eq(processingActivity.id, id));
      return { before: row.status };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'processing_activity.archived',
      entityType: 'processing_activity',
      entityId: id,
      before: { status: result.before },
      after: { status: 'archived' },
    });
    return { id, status: 'archived' };
  }

  async list(tenantId: string, filters?: { role?: string; status?: string }) {
    const conds = [isNull(processingActivity.deletedAt)];
    if (filters?.role) conds.push(eq(processingActivity.role, filters.role));
    if (filters?.status) conds.push(eq(processingActivity.status, filters.status));
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: processingActivity.id,
          nameI18n: processingActivity.nameI18n,
          legalBasis: processingActivity.legalBasis,
          role: processingActivity.role,
          crossBorder: processingActivity.crossBorder,
          status: processingActivity.status,
          dataLocations: processingActivity.dataLocations,
          reviewDate: processingActivity.reviewDate,
          vendorId: processingActivity.vendorId,
          vendorName: vendor.name,
        })
        .from(processingActivity)
        .leftJoin(vendor, eq(processingActivity.vendorId, vendor.id))
        .where(and(...conds))
        .orderBy(desc(processingActivity.createdAt)),
    );
    return rows.map((p) => ({
      id: p.id,
      nameI18n: p.nameI18n,
      legalBasis: p.legalBasis,
      role: p.role,
      crossBorder: p.crossBorder,
      status: p.status,
      dataLocations: (p.dataLocations as string[]) ?? [],
      reviewDate: p.reviewDate?.toISOString() ?? null,
      vendorId: p.vendorId,
      vendorName: p.vendorName ?? null,
    }));
  }

  async get(tenantId: string, id: string) {
    const [row] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(processingActivity)
        .where(and(eq(processingActivity.id, id), isNull(processingActivity.deletedAt))),
    );
    if (!row) throw new NotFoundException(`Операция обработки ${id} не найдена`);
    return row;
  }
}
