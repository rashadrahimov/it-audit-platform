import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { ConnectorSyncService } from '../connectors/connector-sync.service';
import { DbService } from '../db/db.service';
import { account, connector, membership, user } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** Аккаунты (T-054, ADR-0012): импорт из коннектора (EP-INT) + ручное заведение. */
@Injectable()
export class AccountsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
    private readonly connectorSyncService: ConnectorSyncService,
  ) {}

  /** Импорт аккаунтов из коннектора: personnel-records → account (upsert по identifier). */
  async importFromConnector(actor: Actor, connectorId: string) {
    const [conn] = await this.dbService.withTenant(actor.tenantId, (tx) =>
      tx
        .select()
        .from(connector)
        .where(and(eq(connector.id, connectorId), isNull(connector.deletedAt))),
    );
    if (!conn) throw new NotFoundException(`Коннектор ${connectorId} не найден`);

    const { records } = await this.connectorSyncService.collectRecords(actor.tenantId, connectorId);
    let imported = 0;
    await this.dbService.withTenant(actor.tenantId, async (tx) => {
      for (const r of records) {
        const identifier = typeof r.uid === 'string' ? r.uid : (r.dn as string | undefined);
        if (!identifier) continue;
        await tx
          .insert(account)
          .values({
            tenantId: actor.tenantId,
            connectorId,
            identifier,
            displayName: typeof r.fullName === 'string' ? r.fullName : null,
            type: 'human',
            // email-наличие как прокси: LDAP не отдаёт MFA-флаг напрямую
            mfaEnabled: null,
          })
          .onConflictDoUpdate({
            target: [account.tenantId, account.connectorId, account.identifier],
            set: { displayName: typeof r.fullName === 'string' ? r.fullName : null },
          });
        imported += 1;
      }
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'account.imported',
      entityType: 'connector',
      entityId: connectorId,
      after: { imported },
    });
    return { imported };
  }

  async createManual(
    actor: Actor,
    input: { identifier: string; displayName?: string; type?: string; mfaEnabled?: boolean },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(account)
        .values({
          tenantId: actor.tenantId,
          identifier: input.identifier,
          displayName: input.displayName ?? null,
          type: input.type ?? 'human',
          mfaEnabled: input.mfaEnabled ?? null,
        })
        .returning();
      if (!row) throw new Error('Аккаунт не создался');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'account.created',
      entityType: 'account',
      entityId: created.id,
      after: { identifier: created.identifier },
    });
    return created;
  }

  async list(tenantId: string) {
    // T-V07: + owner (оживлено мёртвое поле owner_membership_id)
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          row: account,
          owner: user.fullName,
        })
        .from(account)
        .leftJoin(membership, eq(account.ownerMembershipId, membership.id))
        .leftJoin(user, eq(membership.userId, user.id))
        .orderBy(desc(account.createdAt)),
    );
    return rows.map(({ row: r, owner }) => ({
      id: r.id,
      identifier: r.identifier,
      displayName: r.displayName,
      type: r.type,
      mfaEnabled: r.mfaEnabled,
      status: r.status,
      fromConnector: r.connectorId !== null,
      ownerMembershipId: r.ownerMembershipId,
      owner,
    }));
  }

  /** T-V07: назначить owner аккаунта («Assign accounts to owners» у Vanta). */
  async setOwner(actor: Actor, id: string, ownerMembershipId: string) {
    const [m] = await this.dbService.db
      .select({ id: membership.id })
      .from(membership)
      .where(and(eq(membership.id, ownerMembershipId), eq(membership.tenantId, actor.tenantId)));
    if (!m) throw new BadRequestException('ownerMembershipId: membership не найден в тенанте');
    const row = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [updated] = await tx
        .update(account)
        .set({ ownerMembershipId })
        .where(eq(account.id, id))
        .returning();
      return updated;
    });
    if (!row) throw new NotFoundException(`Аккаунт ${id} не найден`);
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'account.owner_changed',
      entityType: 'account',
      entityId: id,
      after: { ownerMembershipId },
    });
    return { id, ownerMembershipId };
  }

  async deactivate(actor: Actor, id: string) {
    const row = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [updated] = await tx
        .update(account)
        .set({ status: 'deactivated', deactivatedInSource: sql`now()` })
        .where(eq(account.id, id))
        .returning();
      return updated;
    });
    if (!row) throw new NotFoundException(`Аккаунт ${id} не найден`);
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'account.deactivated',
      entityType: 'account',
      entityId: id,
    });
    return { status: row.status };
  }
}
