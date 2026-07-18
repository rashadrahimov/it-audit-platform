import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { ConnectorSyncService } from '../connectors/connector-sync.service';
import { DbService } from '../db/db.service';
import { connector, device } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

const strField = (r: Record<string, unknown>, keys: string[]): string | null => {
  for (const k of keys) {
    if (typeof r[k] === 'string' && r[k]) return r[k] as string;
  }
  return null;
};
const boolField = (r: Record<string, unknown>, key: string): boolean => r[key] === true;

/** Четыре MDM-проверки (B12). Все true → compliant, иначе non_compliant. */
export interface DeviceChecks {
  diskEncryption?: boolean;
  screenLock?: boolean;
  antivirus?: boolean;
  passwordPolicy?: boolean;
}

interface CreateInput extends DeviceChecks {
  name: string;
  os?: string;
  serial?: string;
  ownerPersonnelId?: string;
}

function complianceOf(checks: {
  diskEncryption: boolean;
  screenLock: boolean;
  antivirus: boolean;
  passwordPolicy: boolean;
}): 'compliant' | 'non_compliant' {
  return checks.diskEncryption && checks.screenLock && checks.antivirus && checks.passwordPolicy
    ? 'compliant'
    : 'non_compliant';
}

@Injectable()
export class DevicesService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
    private readonly connectorSyncService: ConnectorSyncService,
  ) {}

  /**
   * Авто-обнаружение устройств из MDM-коннектора (T-071, B12): гейт по capability `inventory`.
   * Проверки берутся из bool-полей записи; compliance_status пересчитывается; upsert по external_id.
   */
  async importFromConnector(actor: Actor, connectorId: string) {
    const [conn] = await this.dbService.withTenant(actor.tenantId, (tx) =>
      tx
        .select()
        .from(connector)
        .where(and(eq(connector.id, connectorId), isNull(connector.deletedAt))),
    );
    if (!conn) throw new NotFoundException(`Коннектор ${connectorId} не найден`);
    if (!conn.capabilities.includes('inventory')) {
      throw new BadRequestException('Коннектор не имеет capability «inventory» (MDM/endpoint)');
    }

    const { records } = await this.connectorSyncService.collectRecords(actor.tenantId, connectorId);
    let imported = 0;
    let updated = 0;
    await this.dbService.withTenant(actor.tenantId, async (tx) => {
      for (const r of records) {
        const externalId = strField(r, ['id', 'serial', 'dn', 'uid']);
        if (!externalId) continue;
        const checks = {
          diskEncryption: boolField(r, 'diskEncryption'),
          screenLock: boolField(r, 'screenLock'),
          antivirus: boolField(r, 'antivirus'),
          passwordPolicy: boolField(r, 'passwordPolicy'),
        };
        const [row] = await tx
          .insert(device)
          .values({
            tenantId: actor.tenantId,
            connectorId,
            externalId,
            source: 'mdm',
            name: strField(r, ['name', 'hostname', 'cn', 'uid']) ?? externalId,
            os: strField(r, ['os']),
            ...checks,
            complianceStatus: complianceOf(checks),
          })
          .onConflictDoUpdate({
            target: [device.connectorId, device.externalId],
            set: { ...checks, complianceStatus: complianceOf(checks) },
          })
          .returning({ createdAt: device.createdAt, updatedAt: device.updatedAt });
        if (row && row.createdAt.getTime() === row.updatedAt.getTime()) imported += 1;
        else updated += 1;
      }
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'device.imported',
      entityType: 'connector',
      entityId: connectorId,
      after: { imported, updated },
    });
    return { imported, updated };
  }

  async create(actor: Actor, input: CreateInput) {
    const checks = {
      diskEncryption: input.diskEncryption ?? false,
      screenLock: input.screenLock ?? false,
      antivirus: input.antivirus ?? false,
      passwordPolicy: input.passwordPolicy ?? false,
    };
    const complianceStatus = complianceOf(checks);
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(device)
        .values({
          tenantId: actor.tenantId,
          name: input.name,
          os: input.os ?? null,
          serial: input.serial ?? null,
          ownerPersonnelId: input.ownerPersonnelId ?? null,
          ...checks,
          complianceStatus,
        })
        .returning();
      if (!row) throw new Error('Устройство не создалось');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'device.created',
      entityType: 'device',
      entityId: created.id,
      after: { name: created.name, complianceStatus: created.complianceStatus },
    });
    return { id: created.id, complianceStatus };
  }

  /** Обновить проверки → пересчитать compliance_status. */
  async updateChecks(actor: Actor, id: string, patch: DeviceChecks) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(device)
        .where(and(eq(device.id, id), isNull(device.deletedAt)));
      if (!row) throw new NotFoundException(`Устройство ${id} не найдено`);
      const checks = {
        diskEncryption: patch.diskEncryption ?? row.diskEncryption,
        screenLock: patch.screenLock ?? row.screenLock,
        antivirus: patch.antivirus ?? row.antivirus,
        passwordPolicy: patch.passwordPolicy ?? row.passwordPolicy,
      };
      const complianceStatus = complianceOf(checks);
      await tx
        .update(device)
        .set({ ...checks, complianceStatus })
        .where(eq(device.id, id));
      return { before: row.complianceStatus, complianceStatus };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'device.checks_updated',
      entityType: 'device',
      entityId: id,
      before: { complianceStatus: result.before },
      after: { complianceStatus: result.complianceStatus },
    });
    return { id, complianceStatus: result.complianceStatus };
  }

  async list(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx.select().from(device).where(isNull(device.deletedAt)).orderBy(desc(device.createdAt)),
    );
    return rows.map((d) => ({
      id: d.id,
      name: d.name,
      os: d.os,
      complianceStatus: d.complianceStatus,
      source: d.source,
      checks: {
        diskEncryption: d.diskEncryption,
        screenLock: d.screenLock,
        antivirus: d.antivirus,
        passwordPolicy: d.passwordPolicy,
      },
    }));
  }
}
