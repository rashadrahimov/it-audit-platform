import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { ConnectorSyncService } from '../connectors/connector-sync.service';
import { DbService } from '../db/db.service';
import { connector, personnelProfile } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

const EMPLOYMENT_STATUSES = ['active', 'onboarding', 'offboarded'];

const strField = (r: Record<string, unknown>, keys: string[]): string | null => {
  for (const k of keys) {
    if (typeof r[k] === 'string' && r[k]) return r[k] as string;
  }
  return null;
};

/** Профили персонала (T-069, B6): импорт из personnel-коннектора + ручное заведение. */
@Injectable()
export class PersonnelService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
    private readonly connectorSyncService: ConnectorSyncService,
  ) {}

  /** Импорт профилей из коннектора (personnel capability): records → personnel_profile (upsert по external_id). */
  async importFromConnector(actor: Actor, connectorId: string) {
    const [conn] = await this.dbService.withTenant(actor.tenantId, (tx) =>
      tx
        .select()
        .from(connector)
        .where(and(eq(connector.id, connectorId), isNull(connector.deletedAt))),
    );
    if (!conn) throw new NotFoundException(`Коннектор ${connectorId} не найден`);
    if (!conn.capabilities.includes('personnel')) {
      throw new BadRequestException('Коннектор не имеет capability «personnel»');
    }

    const { records } = await this.connectorSyncService.collectRecords(actor.tenantId, connectorId);
    let imported = 0;
    let updated = 0;
    await this.dbService.withTenant(actor.tenantId, async (tx) => {
      for (const r of records) {
        const externalId = strField(r, ['id', 'dn', 'uid', 'externalId']);
        if (!externalId) continue;
        const fullName = strField(r, ['fullName', 'cn', 'name']) ?? externalId;
        const email = strField(r, ['email', 'mail']);
        const [row] = await tx
          .insert(personnelProfile)
          .values({ tenantId: actor.tenantId, connectorId, externalId, fullName, email })
          .onConflictDoUpdate({
            target: [personnelProfile.connectorId, personnelProfile.externalId],
            set: { fullName, email },
          })
          .returning({
            createdAt: personnelProfile.createdAt,
            updatedAt: personnelProfile.updatedAt,
          });
        // новый, если created==updated (только что вставлен)
        if (row && row.createdAt.getTime() === row.updatedAt.getTime()) imported += 1;
        else updated += 1;
      }
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'personnel.imported',
      entityType: 'connector',
      entityId: connectorId,
      after: { imported, updated },
    });
    return { imported, updated };
  }

  async createManual(
    actor: Actor,
    input: {
      fullName: string;
      email?: string;
      departmentId?: string;
      membershipId?: string;
      unit?: string;
      position?: string;
      employmentStatus?: string;
      certificates?: unknown[];
      contacts?: Record<string, unknown>;
    },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(personnelProfile)
        .values({
          tenantId: actor.tenantId,
          fullName: input.fullName,
          email: input.email ?? null,
          departmentId: input.departmentId ?? null,
          membershipId: input.membershipId ?? null,
          unit: input.unit ?? null,
          position: input.position ?? null,
          employmentStatus: input.employmentStatus ?? 'active',
          certificates: input.certificates ?? [],
          contacts: input.contacts ?? {},
        })
        .returning();
      if (!row) throw new Error('Профиль не создался');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'personnel.created',
      entityType: 'personnel_profile',
      entityId: created.id,
      after: { fullName: created.fullName },
    });
    return { id: created.id, employmentStatus: created.employmentStatus };
  }

  /** Смена статуса занятости (onboarding→active→offboarded). */
  async setStatus(actor: Actor, id: string, status: string) {
    if (!EMPLOYMENT_STATUSES.includes(status)) {
      throw new BadRequestException(`Недопустимый статус: ${status}`);
    }
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select({ status: personnelProfile.employmentStatus })
        .from(personnelProfile)
        .where(and(eq(personnelProfile.id, id), isNull(personnelProfile.deletedAt)));
      if (!row) throw new NotFoundException(`Профиль ${id} не найден`);
      await tx
        .update(personnelProfile)
        .set({ employmentStatus: status })
        .where(eq(personnelProfile.id, id));
      return { before: row.status, after: status };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'personnel.status_changed',
      entityType: 'personnel_profile',
      entityId: id,
      before: { status: result.before },
      after: { status: result.after },
    });
    return result;
  }

  async list(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(personnelProfile)
        .where(isNull(personnelProfile.deletedAt))
        .orderBy(desc(personnelProfile.createdAt)),
    );
    return rows.map((p) => ({
      id: p.id,
      fullName: p.fullName,
      email: p.email,
      unit: p.unit,
      position: p.position,
      employmentStatus: p.employmentStatus,
      fromConnector: p.connectorId !== null,
    }));
  }
}
